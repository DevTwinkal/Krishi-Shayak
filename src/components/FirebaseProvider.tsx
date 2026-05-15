import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  isAuthReady: boolean;
  error: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  setError: (err: string | null) => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncUserDoc = async (currentUser: User) => {
    const userRef = doc(db, 'users', currentUser.uid);
    try {
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          name: currentUser.displayName || 'Farmer',
          role: 'user',
          preferredLanguage: 'en',
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.warn('Firestore sync skipped or failed:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        localStorage.removeItem('agri_guest_mode');
        await syncUserDoc(currentUser);
        setUser(currentUser);
      } else {
        const persistedGuest = localStorage.getItem('agri_guest_mode');
        if (persistedGuest) {
          try {
            setUser(JSON.parse(persistedGuest));
          } catch {
            localStorage.removeItem('agri_guest_mode');
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login was cancelled.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized. Check Firebase settings.');
      } else if (err.code === 'auth/configuration-not-found') {
        setError('Google Sign-In is not enabled in your Firebase Console. Go to Authentication > Sign-in method to enable it.');
      } else {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setError(null);
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      console.error('Email Login Error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email.');
      } else {
        setError(err.message || 'Login failed.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signupWithEmail = async (email: string, pass: string, name: string) => {
    setError(null);
    try {
      setLoading(true);
      const { user: newUser } = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(newUser, { displayName: name });
      
      try {
        await setDoc(doc(db, 'users', newUser.uid), {
          uid: newUser.uid,
          email: newUser.email,
          name: name,
          role: 'user',
          preferredLanguage: 'en',
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("Firestore signup sync failed:", e);
      }

      setUser({ ...newUser, displayName: name });
    } catch (err: any) {
      console.error('Email Signup Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try logging in.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/configuration-not-found') {
        setError('Email/Password auth is not enabled in your Firebase Console. Go to Authentication > Sign-in method to enable it.');
      } else {
        setError(err.message || 'Signup failed.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = () => {
    setError(null);
    const guestUser = {
      uid: 'guest-' + Math.random().toString(36).substring(7),
      displayName: 'Guest Farmer',
      email: 'guest@krishishayak.local',
      isAnonymous: true,
      photoURL: null
    } as unknown as User;
    
    localStorage.setItem('agri_guest_mode', JSON.stringify(guestUser));
    setUser(guestUser);
  };

  const logout = async () => {
    try {
      setLoading(true);
      localStorage.removeItem('agri_guest_mode');
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Logout Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      loading, 
      isAuthReady, 
      error,
      login, 
      loginWithEmail,
      signupWithEmail,
      continueAsGuest,
      logout,
      setError
    }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
