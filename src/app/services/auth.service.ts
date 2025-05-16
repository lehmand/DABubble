import { Injectable, OnInit, inject } from '@angular/core';
import { getAuth, signOut } from '@angular/fire/auth';
import { Router } from '@angular/router';
import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { User } from '../models/user.class';
import {
  Firestore,
  setDoc,
  doc,
  getDoc,
  collection,
  where,
  query,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { OverlayStatusService } from './overlay-status.service';
import { GlobalService } from '../global.service';
import { LoginAuthService } from './login-auth.service';
import { onAuthStateChanged } from '@angular/fire/auth';
import { GlobalVariableService } from './global-variable.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnInit {
  router = inject(Router);
  user: User = new User();
  firestore = inject(Firestore);
  currentUser: any;
  guestUser: User = new User();
  overlayStatusService = inject(OverlayStatusService);
  LogInAuth = inject(LoginAuthService);
  global = inject(GlobalService);
  loggedOut = false;
  globalVariable = inject(GlobalVariableService);
  isGuest = false;
  private redirectInProgress = false;

  constructor() {
    this.initAuthListener();

    window.addEventListener('beforeunload', async (event) => {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        await this.updateStatus(currentUser.uid, 'offline');
      }
    });
  }

  ngOnInit(): void {}

  initAuthListener() {
    const auth = getAuth();

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser = user;
        await this.updateStatus(user.uid, 'online');
        if (user.isAnonymous) {
          this.LogInAuth.setIsGuestLogin(true);
        } else {
          this.LogInAuth.setIsGuestLogin(false);
        }
      } else {
        this.currentUser = null;
      }
    });
  }

  async deleteGuest(userId: any) {
    await deleteDoc(doc(this.firestore, 'users', userId));
  }

  async updateStatus(userId: string, status: 'online' | 'offline') {
    if (!userId) return;
    const docRef = doc(this.firestore, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      try {
        await updateDoc(docRef, { status: status });
      } catch (err) {
        console.error('Fehler beim Aktualisieren des Benutzerstatus: ', err);
      }
    } else {
      console.warn(
        `Dokument für Benutzer ${userId} existiert nicht. Wird übersprungen.`
      );
    }
  }

  async googleLogIn() {
  const auth = getAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  
  // Markiere, dass ein Redirect im Gange ist
  localStorage.setItem('redirectInProgress', 'true');
  
  try {
    // Tatsächlicher Redirect
    console.log('Starte Google-Login-Redirect...');
    await signInWithRedirect(auth, provider);
    // Dieser Code wird nie erreicht, da der Redirect die Seite neu lädt
  } catch (error) {
    console.error('Fehler beim Login-Redirect:', error);
    localStorage.removeItem('redirectInProgress');
  }
}

  async handleAuthState() {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  console.log('Aktueller Benutzer:', currentUser);
  
  // Prüfe, ob ein Redirect im Gange war
  const redirectPending = localStorage.getItem('redirectInProgress') === 'true';
  console.log('Redirect pending:', redirectPending);
  
  if (redirectPending && currentUser) {
    console.log('Benutzer nach Redirect authentifiziert, verarbeite...');
    
    try {
      // Zuerst versuchen, das Redirect-Ergebnis zu bekommen
      const result = await getRedirectResult(auth);
      console.log('Redirect-Ergebnis:', result);
      
      // Selbst wenn result null ist, können wir mit dem currentUser arbeiten
      const user = result?.user || currentUser;
      
      // Google-Provider-Daten extrahieren
      const googleProviderData = user.providerData.find(
        (data) => data.providerId === 'google.com'
      );
      
      // Wenn es Google-Provider-Daten gibt, handelt es sich um einen Google-Login
      const isGoogleLogin = !!googleProviderData;
      
      // E-Mail aus Provider-Daten oder direkt vom Benutzer
      const email = googleProviderData?.email || user.email;
      
      if (user.photoURL) {
        localStorage.setItem(`userPhoto_${user.uid}`, user.photoURL);
      }
      
      this.user = new User({
        picture: user.photoURL,
        uid: user.uid,
        name: user.displayName,
        email: email,
      });
      
      await this.addGoogleUserToFirestore(this.user);
      
      if (isGoogleLogin) {
        this.globalVariable.googleAccountLogIn = true;
      }
      
      this.LogInAuth.setLoginSuccessful(true);
      
      // Navigiere zur Welcome-Seite
      this.router.navigate(['/welcome', user.uid]);
      
      setTimeout(() => {
        this.LogInAuth.setLoginSuccessful(false);
      }, 1500);
      
      // Status aktualisieren
      await this.updateStatus(user.uid, 'online');
      
      // Bereinige den Redirect-Status
      localStorage.removeItem('redirectInProgress');
      
      return true;
    } catch (error) {
      console.error('Fehler beim Verarbeiten des Auth-States:', error);
      localStorage.removeItem('redirectInProgress');
      return false;
    }
  } else if (redirectPending) {
    console.log('Redirect im Gange, aber kein Benutzer. Warte...');
    return false;
  } else if (currentUser) {
    console.log('Benutzer bereits angemeldet, kein Redirect nötig');
    return false;
  } else {
    console.log('Kein Benutzer angemeldet, kein Redirect im Gange');
    return false;
  }
}

  async initializeAuth() {
  const auth = getAuth();
  
  // Auf Auth-State-Change hören
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('Benutzer ist angemeldet:', user);
      
      // Prüfen, ob der Benutzer von einem Redirect kommt
      if (localStorage.getItem('redirectInProgress') === 'true') {
        console.log('Auth-State-Change nach Redirect, verarbeite...');
        await this.handleAuthState();
      }
    }
  });
  
  // Auch explizit prüfen, ob ein Auth-State vorliegt
  const result = await this.handleAuthState();
  
  // Optional: Auch nach dem Redirect-Ergebnis suchen, falls der Auth-State nicht ausreicht
  if (!result) {
    try {
      const redirectResult = await getRedirectResult(getAuth());
      if (redirectResult) {
        // Verarbeite das Redirect-Ergebnis separat
        console.log('Redirect-Ergebnis gefunden, verarbeite...');
        // ... Verarbeitung ähnlich wie in handleAuthState
      }
    } catch (error) {
      console.error('Fehler beim Verarbeiten des Redirect-Ergebnisses:', error);
    }
  }
}

  async addGoogleUserToFirestore(user: User) {
    const userRef = doc(this.firestore, 'users', user.uid);
    await setDoc(userRef, {
      name: user.name,
      email: user.email,
      picture:
        user.picture ||
        localStorage.getItem(`userPhoto_${user.uid}`) ||
        '../../assets/img/avatar/avatar4.png',
    });
  }

  async logOut() {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    try {
      if (currentUser) {
        await this.updateStatus(currentUser.uid, 'offline');
        if (currentUser.isAnonymous) {
          await deleteDoc(doc(this.firestore, 'users', currentUser.uid));
        }
        if (currentUser?.isAnonymous) {
          this.deleteGuest(currentUser.uid);
        }
        await signOut(auth);
      }
      this.globalVariable.googleAccountLogIn = false;
      this.overlayStatusService.setOverlayStatus(false);
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  async SignGuestIn() {
    const auth = getAuth();
    /*  this.globalVariable.isGuest = true; */
    try {
      const result = await signInAnonymously(auth);
      const guestUser = new User({
        uid: result.user.uid,
        name: 'Gast',
        email: `guest_${result.user.uid}@anonymous.com`,
        picture: './assets/img/picture_frame.png',
        status: 'online',
      });
      const userRef = doc(this.firestore, 'users', guestUser.uid);
      const docSnap = await getDoc(userRef);

      if (!docSnap.exists()) {
        await setDoc(userRef, guestUser.toJSON());
      }

      this.LogInAuth.setIsGuestLogin(true);
      this.overlayStatusService.setOverlayStatus(true);
      this.LogInAuth.setLoginSuccessful(true);
      setTimeout(() => {
        this.LogInAuth.setLoginSuccessful(false);
      }, 1500);
      this.router.navigate(['/welcome', guestUser.uid]);
    } catch (error) {
      console.error('Error during anonymous sign-in:', error);
    }
    this.isGuest = true;
  }

  async findUserByMail(identifier: string) {
    const usersCollection = collection(this.firestore, 'users');
    const q = query(usersCollection, where('email', '==', identifier));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    } else {
      return null;
    }
  }

  async addUserToFirestore(user: User) {
    const usersCollection = collection(this.firestore, 'users');
    const docRef = await addDoc(usersCollection, user.toJSON());
    return docRef;
  }
}
