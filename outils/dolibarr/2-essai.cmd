@echo off
rem Verifie tout (configuration, jeton, lecture de Dolibarr) et montre ce qui partirait, sans rien envoyer.
cd /d "%~dp0"
"C:\xampp\php\php.exe" envoi-mouvements.php --essai
pause
