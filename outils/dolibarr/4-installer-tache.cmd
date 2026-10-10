@echo off
rem Installe la tache planifiee "STEPAG\Envoi mouvements Dolibarr" : toutes les 15 minutes, compte SYSTEM
rem (tourne meme sans session ouverte). A lancer en administrateur : clic droit > Executer en tant qu'administrateur.
setlocal
set "PHP=C:\xampp\php\php.exe"
set "SCRIPT=%~dp0envoi-mouvements.php"
set "TACHE=STEPAG\Envoi mouvements Dolibarr"

if not exist "%PHP%" (
  echo PHP introuvable : %PHP%
  echo Corriger la ligne "set PHP=" de ce fichier.
  pause
  exit /b 1
)
if not exist "%~dp0config.ini" (
  echo config.ini absent dans %~dp0 : lancer d'abord 1-creer-jeton.cmd.
  pause
  exit /b 1
)

schtasks /Create /F /TN "%TACHE%" /SC MINUTE /MO 15 /RU SYSTEM /RL HIGHEST /TR "\"%PHP%\" \"%SCRIPT%\""
if errorlevel 1 (
  echo.
  echo Echec : relancer ce fichier en administrateur ^(clic droit ^> Executer en tant qu'administrateur^).
  pause
  exit /b 1
)
schtasks /Run /TN "%TACHE%"
echo.
echo Tache installee et lancee une premiere fois. Journal : %~dp0journal\
echo Verification : schtasks /Query /TN "%TACHE%" /V /FO LIST
pause
