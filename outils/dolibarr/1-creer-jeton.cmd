@echo off
rem Ecrit un jeton neuf dans config.ini (s'il est vide) et l'affiche pour le secret GitHub DOLIBARR_JETON.
cd /d "%~dp0"
"C:\xampp\php\php.exe" envoi-mouvements.php --creer-jeton
pause
