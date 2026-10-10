<?php
/**
 * Envoi automatique des mouvements de stock Dolibarr vers le suivi des fuites (chantier v3, X8).
 *
 * Tourne sur le serveur Dolibarr (tâche planifiée Windows toutes les 15 minutes, installer-tache.cmd).
 * Sortant seulement : il lit la base Dolibarr en local (lecture seule, comme export.php) et pousse vers la
 * fonction Supabase dolibarr-mouvements ; rien n'entre sur le serveur, l'API Dolibarr reste fermée à Internet.
 *
 *  1. demande à la fonction, pour chaque entrepôt suivi (réglé dans le panneau), le plus grand mouvement déjà reçu ;
 *  2. lit dans Dolibarr les mouvements plus récents, plus ceux des derniers jours (sécurité : un renvoi ne double
 *     rien, la base ne garde que les nouveaux ou changés) ; après une coupure, il repart donc de là où il en était ;
 *  3. les envoie par lots ; un lot refusé est réessayé au passage suivant ;
 *  4. tient un journal local (journal/envoi-AAAA-MM.log, 12 mois gardés) ; une lecture de Dolibarr impossible est
 *     aussi signalée au panneau (page Rapprochement).
 *
 * Jamais de prix, PMP ni valeur : seules les colonnes utiles sont lues.
 *
 * Usage (depuis ce dossier) :
 *   C:\xampp\php\php.exe envoi-mouvements.php                 envoi normal (tâche planifiée)
 *   C:\xampp\php\php.exe envoi-mouvements.php --essai         vérifie tout et montre ce qui partirait, sans rien envoyer
 *   C:\xampp\php\php.exe envoi-mouvements.php --tout          renvoie tout l'historique des entrepôts suivis
 *   C:\xampp\php\php.exe envoi-mouvements.php --creer-jeton   écrit un jeton neuf dans config.ini (s'il est vide) et l'affiche
 *
 * Compatible PHP 7.1 et plus (XAMPP). Extensions : mysqli, curl (ou openssl), mbstring conseillée.
 */

const VERSION_SCRIPT = '1.0';

ini_set('serialize_precision', '-1');
date_default_timezone_set('Africa/Casablanca');

$DOSSIER = __DIR__;
$options = array_slice($argv, 1);
$ESSAI = in_array('--essai', $options, true);
$TOUT = in_array('--tout', $options, true);

// ---------------------------------------------------------------- journal local
function journal($message)
{
	global $DOSSIER;
	$ligne = date('Y-m-d H:i:s').'  '.$message;
	echo $ligne.PHP_EOL;
	$dossier = $DOSSIER.'/journal';
	if (!is_dir($dossier)) {
		@mkdir($dossier, 0700, true);
	}
	@file_put_contents($dossier.'/envoi-'.date('Y-m').'.log', $ligne."\r\n", FILE_APPEND | LOCK_EX);
}

function purger_journaux()
{
	global $DOSSIER;
	$fichiers = glob($DOSSIER.'/journal/envoi-*.log');
	if (!$fichiers) {
		return;
	}
	rsort($fichiers);
	foreach (array_slice($fichiers, 12) as $f) {
		@unlink($f);
	}
}

function arreter($message, $code = 1)
{
	journal('ÉCHEC : '.$message);
	exit($code);
}

// ---------------------------------------------------------------- configuration
function lire_config()
{
	global $DOSSIER;
	$fichier = $DOSSIER.'/config.ini';
	if (!is_file($fichier)) {
		arreter('config.ini introuvable : lancer d\'abord 1-creer-jeton.cmd (il le crée à partir de config.exemple.ini).');
	}
	$c = parse_ini_file($fichier, false, INI_SCANNER_RAW);
	if ($c === false) {
		arreter('config.ini illisible (vérifier la syntaxe : nom = valeur).');
	}
	$c = array_map(function ($v) {
		return trim(trim((string) $v), '"\'');
	}, $c);
	$defauts = array(
		'url_fonction' => '',
		'jeton' => '',
		'conf_dolibarr' => 'C:/xampp/htdocs/erp/conf/conf.php',
		'jours_recouvrement' => '3',
		'taille_lot' => '1000',
		'certificats' => '',
	);
	return array_merge($defauts, $c);
}

function creer_jeton()
{
	global $DOSSIER;
	$fichier = $DOSSIER.'/config.ini';
	if (!is_file($fichier)) {
		if (!@copy($DOSSIER.'/config.exemple.ini', $fichier)) {
			arreter('config.exemple.ini introuvable à côté du script.');
		}
	}
	$texte = file_get_contents($fichier);
	if (preg_match('/^\s*jeton\s*=\s*"?([0-9a-f]{32,})"?\s*$/mi', $texte, $m)) {
		echo "config.ini contient déjà un jeton : il n'est pas remplacé.\n";
		echo "Pour en créer un autre, vider la ligne « jeton = » puis relancer.\n";
		exit(0);
	}
	$jeton = bin2hex(random_bytes(32));
	$nouveau = preg_replace('/^\s*jeton\s*=.*$/mi', 'jeton = '.$jeton, $texte, 1, $n);
	if ($n === 0) {
		$nouveau = rtrim($texte)."\r\njeton = ".$jeton."\r\n";
	}
	file_put_contents($fichier, $nouveau);
	echo "Jeton écrit dans config.ini.\n\n";
	echo "À copier dans GitHub (secret DOLIBARR_JETON), puis fermer cette fenêtre :\n\n";
	echo $jeton."\n\n";
	echo "Ne le collez nulle part ailleurs (ni e-mail, ni discussion).\n";
	exit(0);
}

// ---------------------------------------------------------------- appel de la fonction Supabase
function appeler($config, $corps)
{
	$json = json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | (defined('JSON_INVALID_UTF8_SUBSTITUTE') ? JSON_INVALID_UTF8_SUBSTITUTE : 0));
	if ($json === false) {
		return array('ok' => false, 'statut' => 0, 'corps' => null, 'erreur' => 'encodage JSON impossible ('.json_last_error_msg().')');
	}
	$entetes = array(
		'Content-Type: application/json',
		'x-jeton-dolibarr: '.$config['jeton'],
		'User-Agent: stepag-envoi-dolibarr/'.VERSION_SCRIPT,
	);
	$certificats = $config['certificats'];
	if ($certificats === '' && is_file('C:/xampp/apache/bin/curl-ca-bundle.crt')) {
		$certificats = 'C:/xampp/apache/bin/curl-ca-bundle.crt';
	}

	if (function_exists('curl_init')) {
		$ch = curl_init($config['url_fonction']);
		curl_setopt_array($ch, array(
			CURLOPT_POST => true,
			CURLOPT_POSTFIELDS => $json,
			CURLOPT_HTTPHEADER => $entetes,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_CONNECTTIMEOUT => 20,
			CURLOPT_TIMEOUT => 120,
			CURLOPT_SSL_VERIFYPEER => true,
			CURLOPT_SSL_VERIFYHOST => 2,
		));
		if ($certificats !== '') {
			curl_setopt($ch, CURLOPT_CAINFO, $certificats);
		}
		$reponse = curl_exec($ch);
		$statut = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$erreur = $reponse === false ? curl_error($ch) : '';
		if (PHP_VERSION_ID < 80000) {
			curl_close($ch);
		}
	} else {
		$ssl = array('verify_peer' => true, 'verify_peer_name' => true);
		if ($certificats !== '') {
			$ssl['cafile'] = $certificats;
		}
		$contexte = stream_context_create(array(
			'http' => array('method' => 'POST', 'header' => implode("\r\n", $entetes), 'content' => $json, 'timeout' => 120, 'ignore_errors' => true),
			'ssl' => $ssl,
		));
		$reponse = @file_get_contents($config['url_fonction'], false, $contexte);
		$statut = 0;
		// PHP 8.4+ : http_get_last_response_headers() ; avant : variable locale remplie par file_get_contents().
		$variable = 'http_response_header';
		$entetesRecus = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : (isset($$variable) ? $$variable : null);
		if (isset($entetesRecus[0]) && preg_match('#\s(\d{3})\s#', $entetesRecus[0], $m)) {
			$statut = (int) $m[1];
		}
		$e = error_get_last();
		$erreur = $reponse === false ? ($e ? $e['message'] : 'appel impossible') : '';
	}

	if ($reponse === false) {
		return array('ok' => false, 'statut' => 0, 'corps' => null, 'erreur' => 'réseau : '.$erreur);
	}
	$donnees = json_decode($reponse, true);
	$ok = $statut >= 200 && $statut < 300 && is_array($donnees);
	$message = '';
	if (!$ok) {
		$message = 'HTTP '.$statut.(is_array($donnees) && isset($donnees['erreur']) ? ' : '.$donnees['erreur'] : ' : '.substr(trim((string) $reponse), 0, 200));
	}
	return array('ok' => $ok, 'statut' => $statut, 'corps' => $donnees, 'erreur' => $message);
}

function poste()
{
	$nom = function_exists('gethostname') ? gethostname() : '';
	return substr($nom ? $nom : 'serveur', 0, 100);
}

function signaler_erreur($config, $message)
{
	global $ESSAI;
	if ($ESSAI) {
		return;
	}
	appeler($config, array(
		'action' => 'erreur',
		'message' => $message,
		'script' => array('version' => VERSION_SCRIPT, 'poste' => poste()),
	));
}

// ---------------------------------------------------------------- lecture de Dolibarr (lecture seule)
function conf_dolibarr($chemin)
{
	$src = @file_get_contents($chemin);
	if ($src === false) {
		return null;
	}
	$conf = array();
	foreach (array('db_host', 'db_port', 'db_name', 'db_prefix', 'db_user', 'db_pass') as $k) {
		if (preg_match('/^\s*\$dolibarr_main_'.$k.'\s*=\s*([\'"])(.*?)\1\s*;/m', $src, $m)) {
			$conf[$k] = stripslashes($m[2]);
		}
	}
	return $conf;
}

function base_dolibarr($conf)
{
	mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
	$port = empty($conf['db_port']) ? 3306 : (int) $conf['db_port'];
	$db = new mysqli($conf['db_host'], $conf['db_user'], isset($conf['db_pass']) ? $conf['db_pass'] : '', $conf['db_name'], $port);
	$db->set_charset('utf8mb4');
	$db->query('SET SESSION TRANSACTION READ ONLY');
	$db->query('START TRANSACTION READ ONLY');
	return $db;
}

// Message envoyé au panneau : jamais l'identifiant ni le mot de passe de la base (texte brut de MySQL écarté).
function message_base($e)
{
	$code = (int) $e->getCode();
	$motifs = array(
		1044 => 'accès refusé à la base',
		1045 => 'identifiant ou mot de passe de la base refusé',
		1049 => 'base introuvable',
		1146 => 'table absente',
		2002 => 'serveur MySQL injoignable (arrêté ?)',
		2006 => 'connexion à MySQL perdue',
		2013 => 'connexion à MySQL perdue',
	);
	$motif = isset($motifs[$code]) ? $motifs[$code] : 'erreur MySQL';
	return 'Lecture de Dolibarr impossible : '.$motif.' (code '.$code.')';
}

function nettoyer($v, $max)
{
	if ($v === null) {
		return null;
	}
	$v = html_entity_decode(strip_tags((string) $v), ENT_QUOTES | ENT_HTML5, 'UTF-8');
	$v = trim(preg_replace('/\s+/u', ' ', $v));
	if (function_exists('mb_substr')) {
		$v = mb_substr($v, 0, $max, 'UTF-8');
	} else {
		$v = substr($v, 0, $max);
	}
	return $v === '' ? null : $v;
}

function entier_ou_nul($v)
{
	return ($v === null || (int) $v <= 0) ? null : (int) $v;
}

/**
 * Mouvements d'un entrepôt, dans l'ordre des rowid. $depuis_id nul : tout l'historique. Sinon : rowid plus grand,
 * ou date des $jours derniers jours. Le bon de transfert (module StockTransfers, s'il existe) donne la contrepartie
 * et le projet, comme dans export.php.
 */
function lire_mouvements($db, $prefixe, $entrepot, $depuis_id, $jours, $avec_bons)
{
	$p = preg_replace('/[^A-Za-z0-9_]/', '', $prefixe);
	$entrepot = (int) $entrepot;
	$condition = "m.fk_entrepot = $entrepot";
	if ($depuis_id !== null) {
		$condition .= ' AND (m.rowid > '.(int) $depuis_id.' OR m.datem >= DATE_SUB(NOW(), INTERVAL '.max(0, (int) $jours).' DAY))';
	}
	if ($avec_bons) {
		$bon = "LEFT JOIN {$p}stocktransfers_transfers t ON t.rowid = (
       SELECT MIN(t2.rowid)
         FROM {$p}stocktransfers_transfers t2
        WHERE CONVERT(t2.label USING utf8) COLLATE utf8_unicode_ci = REPLACE(m.label, ' CANCEL', '')
          AND (t2.fk_depot1 = m.fk_entrepot OR t2.fk_depot2 = m.fk_entrepot))
LEFT JOIN {$p}entrepot e2 ON e2.rowid = IF(t.fk_depot1 = m.fk_entrepot, t.fk_depot2, t.fk_depot1)";
		$colonnesBon = "t.rowid AS bon_rowid, t.fk_project AS bon_projet, e2.rowid AS contrepartie_rowid, e2.ref AS contrepartie_ref";
		$projet = "COALESCE(NULLIF(m.fk_project, 0), NULLIF(m.fk_projet, 0), t.fk_project, e.fk_project)";
	} else {
		$bon = '';
		$colonnesBon = "NULL AS bon_rowid, NULL AS bon_projet, NULL AS contrepartie_rowid, NULL AS contrepartie_ref";
		$projet = "COALESCE(NULLIF(m.fk_project, 0), NULLIF(m.fk_projet, 0), e.fk_project)";
	}
	$sql = "SELECT
  m.rowid,
  DATE_FORMAT(m.datem, '%Y-%m-%d %H:%i:%s') AS date_mouvement,
  m.fk_product AS produit_rowid,
  p.ref AS produit_ref,
  p.label AS produit_label,
  m.fk_entrepot AS entrepot_rowid,
  e.ref AS entrepot_ref,
  ROUND(m.value, 4) AS quantite,
  m.type_mouvement,
  m.label AS libelle,
  m.inventorycode,
  m.origintype,
  m.fk_origin,
  $projet AS projet_rowid,
  u.short_label AS unite,
  $colonnesBon
FROM {$p}stock_mouvement m
JOIN {$p}product p ON p.rowid = m.fk_product
JOIN {$p}entrepot e ON e.rowid = m.fk_entrepot
LEFT JOIN {$p}c_units u ON u.rowid = p.fk_unit
$bon
WHERE $condition
ORDER BY m.rowid";
	$res = $db->query($sql);
	$mouvements = array();
	while ($r = $res->fetch_assoc()) {
		$libelle = nettoyer($r['libelle'], 255);
		$code = nettoyer($r['inventorycode'], 128);
		$origine = trim((string) $r['origintype']);
		if ($origine === '') {
			$bonId = entier_ou_nul($r['bon_rowid']);
		} elseif ($origine === 'stocktransfers_transfer') {
			$bonId = entier_ou_nul($r['fk_origin']);
		} else {
			$bonId = null;
		}
		$mouvements[] = array(
			'dolibarr_id' => (int) $r['rowid'],
			'date_mouvement' => $r['date_mouvement'],
			'produit_dolibarr_id' => (int) $r['produit_rowid'],
			'produit_ref' => nettoyer($r['produit_ref'], 64),
			'produit_designation' => nettoyer($r['produit_label'], 255),
			'entrepot_id' => (int) $r['entrepot_rowid'],
			'entrepot_libelle' => nettoyer($r['entrepot_ref'], 255),
			'entrepot_contrepartie_id' => entier_ou_nul($r['contrepartie_rowid']),
			'entrepot_contrepartie' => nettoyer($r['contrepartie_ref'], 255),
			'quantite' => (float) $r['quantite'],
			'type_mouvement' => (int) $r['type_mouvement'],
			'libelle' => $libelle,
			'code_inventaire' => $code,
			'annulation' => (bool) (preg_match('/ CANCEL\s*$/', (string) $libelle) || preg_match('/ CANCEL\s*$/', (string) $code)),
			'projet_id' => entier_ou_nul($r['projet_rowid']),
			'bon_id' => $bonId,
			'unite' => nettoyer($r['unite'], 20),
		);
	}
	$res->free();
	return $mouvements;
}

// ---------------------------------------------------------------- programme
if (in_array('--creer-jeton', $options, true)) {
	creer_jeton();
}

$debut = microtime(true);
$config = lire_config();
if (!preg_match('#^https://[^/\s]+/functions/v1/dolibarr-mouvements$#', $config['url_fonction'])
	&& !preg_match('#^http://(127\.0\.0\.1|localhost)(:\d+)?/#', $config['url_fonction'])) {
	arreter('url_fonction invalide dans config.ini (https://<projet>.supabase.co/functions/v1/dolibarr-mouvements attendu).');
}
if (!preg_match('/^[0-9a-f]{32,}$/i', $config['jeton'])) {
	arreter('jeton absent ou invalide dans config.ini (lancer 1-creer-jeton.cmd).');
}
if (!class_exists('mysqli')) {
	arreter('extension PHP mysqli absente (php.ini : extension=mysqli).');
}

// Une seule exécution à la fois (une tâche lente ne se superpose pas à la suivante).
$verrou = @fopen($DOSSIER.'/envoi.lock', 'c');
if (!$verrou) {
	arreter('impossible d\'écrire dans '.$DOSSIER.' (droits du dossier) : le compte qui lance le script doit pouvoir y écrire.');
}
if (!flock($verrou, LOCK_EX | LOCK_NB)) {
	journal('Une exécution est déjà en cours : rien à faire.');
	exit(0);
}

purger_journaux();
if ($ESSAI) {
	journal('ESSAI (rien ne sera envoyé) : PHP '.PHP_VERSION.', curl '.(function_exists('curl_init') ? 'oui' : 'non (repli openssl)').', poste '.poste());
}

// 1. État côté Supabase : entrepôts suivis et dernier mouvement reçu pour chacun.
$etat = appeler($config, array('action' => 'etat', 'script' => array('version' => VERSION_SCRIPT, 'poste' => poste())));
if (!$etat['ok']) {
	arreter('fonction Supabase injoignable ou refus ('.$etat['erreur'].') ; nouvel essai au prochain passage.');
}
$entrepots = isset($etat['corps']['entrepots']) && is_array($etat['corps']['entrepots']) ? $etat['corps']['entrepots'] : array();
if ($ESSAI) {
	journal('Fonction Supabase : jeton accepté ; entrepôts suivis : '.($entrepots ? implode(', ', array_map(function ($e) {
		return $e['id'].' (dernier mouvement reçu : '.($e['dernier_id'] === null ? 'aucun' : $e['dernier_id']).')';
	}, $entrepots)) : 'aucun'));
}

// 2. Lecture de Dolibarr.
$conf = conf_dolibarr($config['conf_dolibarr']);
if (!$conf || empty($conf['db_name'])) {
	$message = 'Lecture de Dolibarr impossible : fichier de configuration de Dolibarr introuvable ou illisible';
	signaler_erreur($config, $message);
	arreter($message.' ('.$config['conf_dolibarr'].').');
}
$prefixe = isset($conf['db_prefix']) && $conf['db_prefix'] !== '' ? $conf['db_prefix'] : 'llx_';
$aEnvoyer = array();
try {
	$db = base_dolibarr($conf);
	$p = preg_replace('/[^A-Za-z0-9_]/', '', $prefixe);
	$avecBons = $db->query("SHOW TABLES LIKE '{$p}stocktransfers_transfers'")->num_rows > 0;
	foreach ($entrepots as $e) {
		$depuis = ($TOUT || $e['dernier_id'] === null) ? null : (int) $e['dernier_id'];
		$lus = lire_mouvements($db, $prefixe, (int) $e['id'], $depuis, (int) $config['jours_recouvrement'], $avecBons);
		$nouveaux = 0;
		foreach ($lus as $m) {
			if ($depuis === null || $m['dolibarr_id'] > $depuis) {
				$nouveaux++;
			}
		}
		journal('Entrepôt '.$e['id'].' : '.count($lus).' mouvement(s) lu(s)'.($depuis === null ? ' (tout l\'historique)' : ', dont '.$nouveaux.' après le n° '.$depuis));
		$aEnvoyer = array_merge($aEnvoyer, $lus);
	}
	$db->rollback();
	$db->close();
} catch (mysqli_sql_exception $ex) {
	$message = message_base($ex);
	signaler_erreur($config, $message);
	arreter($message.'.');
}

if ($ESSAI) {
	foreach (array_slice($aEnvoyer, -3) as $m) {
		journal('  exemple : n° '.$m['dolibarr_id'].' du '.$m['date_mouvement'].', '.$m['produit_ref'].' '.$m['quantite'].' '.$m['unite'].', « '.$m['libelle'].' »');
	}
	journal('ESSAI terminé : '.count($aEnvoyer).' mouvement(s) seraient envoyés. Tout est prêt.');
	exit(0);
}

// 3. Envoi par lots, dans l'ordre des rowid (le point de reprise côté Supabase avance lot après lot).
$taille = max(50, min(5000, (int) $config['taille_lot']));
$lots = $aEnvoyer ? array_chunk($aEnvoyer, $taille) : array(array());
$total = array('nouveaux' => 0, 'modifies' => 0, 'ignores' => 0);
foreach ($lots as $i => $lot) {
	$r = appeler($config, array(
		'action' => 'envoyer',
		'mouvements' => $lot,
		'script' => array('version' => VERSION_SCRIPT, 'poste' => poste()),
	));
	if (!$r['ok']) {
		arreter('lot '.($i + 1).'/'.count($lots).' refusé ('.$r['erreur'].') ; nouvel essai au prochain passage.');
	}
	foreach ($total as $k => $v) {
		$total[$k] += isset($r['corps'][$k]) ? (int) $r['corps'][$k] : 0;
	}
}

journal(sprintf('OK : %d mouvement(s) envoyé(s) en %d lot(s) ; %d nouveau(x), %d mis à jour, %d ignoré(s) ; %.1f s.',
	count($aEnvoyer), count($lots), $total['nouveaux'], $total['modifies'], $total['ignores'], microtime(true) - $debut));
exit(0);
