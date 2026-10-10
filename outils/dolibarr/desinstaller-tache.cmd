@echo off
rem Supprime la tache planifiee de l'envoi automatique (l'import CSV du panneau reste possible).
rem A lancer en administrateur.
schtasks /Delete /F /TN "STEPAG\Envoi mouvements Dolibarr"
pause
