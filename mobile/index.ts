import { registerRootComponent } from 'expo';

import App from './App';
// Tâche de fond du suivi GPS : définie dès le chargement du paquet, même quand Android réveille l'appli sans écran.
import './src/suivi-gps';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
