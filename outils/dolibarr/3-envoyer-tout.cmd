@echo off
rem Renvoie tout l'historique des entrepots suivis (a faire une fois a l'installation ; sans danger : rien n'est double).
cd /d "%~dp0"
"C:\xampp\php\php.exe" envoi-mouvements.php --tout
pause
