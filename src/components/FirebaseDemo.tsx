import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  serverTimestamp, 
  User, 
  OperationType, 
  handleFirestoreError 
} from '../firebase';
import { LogIn, LogOut, Save, User as UserIcon, AlertCircle, CheckCircle2 } from 'lucide-react';

const FirebaseDemo: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        console.log("User logged in:", {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName
        });
      } else {
        console.log("User is logged out");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setStatus({ type: 'info', message: 'Logging in...' });
      console.log("Starting Google Login...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Login successful:", result.user.displayName);
      setStatus({ type: 'success', message: `Welcome, ${result.user.displayName}!` });
    } catch (error) {
      console.error("Login failed:", error);
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Login failed' });
    }
  };

  const handleLogout = async () => {
    try {
      console.log("Logging out...");
      await signOut(auth);
      setStatus({ type: 'success', message: 'Logged out successfully' });
    } catch (error) {
      console.error("Logout failed:", error);
      setStatus({ type: 'error', message: 'Logout failed' });
    }
  };

  const handleSaveData = async () => {
    if (!user) {
      console.warn("Save attempt without login");
      setStatus({ type: 'error', message: 'Please login first to save data!' });
      return;
    }

    try {
      setStatus({ type: 'info', message: 'Saving data to Firestore...' });
      console.log("Saving user data for UID:", user.uid);
      
      const userRef = doc(db, 'users', user.uid);
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(), // In a real app, you'd check if doc exists first
      };

      await setDoc(userRef, userData, { merge: true });
      
      console.log("Data saved successfully to users/" + user.uid);
      setStatus({ type: 'success', message: 'User data saved to Firestore successfully!' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <UserIcon className="w-8 h-8" />
            Firebase Auth & Firestore Demo
          </h1>
          <p className="text-blue-100 mt-2 opacity-90">
            Google Login and User Data Persistence
          </p>
        </div>

        <div className="p-8 space-y-8">
          {/* Status Messages */}
          {status && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300 ${
              status.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
              status.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" /> :
               status.type === 'error' ? <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" /> :
               <div className="w-5 h-5 mt-0.5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
              <p className="text-sm font-medium">{status.message}</p>
            </div>
          )}

          {/* User Profile Section */}
          <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl border border-gray-200 border-dashed">
            {user ? (
              <div className="text-center space-y-4">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'User'} 
                    className="w-24 h-24 rounded-full border-4 border-white shadow-lg mx-auto"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                    <UserIcon className="w-12 h-12 text-blue-600" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{user.displayName || 'Anonymous User'}</h2>
                  <p className="text-gray-500 text-sm">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono">UID: {user.uid}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 font-medium">Not logged in</p>
                <p className="text-gray-400 text-sm mt-1">Please sign in to continue</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!user ? (
              <button
                onClick={handleLogin}
                className="flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-gray-700 hover:border-blue-500 hover:bg-blue-50 transition-all group shadow-sm"
              >
                <LogIn className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
                Googleでログイン
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl font-bold text-gray-700 hover:border-red-500 hover:bg-red-50 transition-all group shadow-sm"
              >
                <LogOut className="w-5 h-5 text-red-600 group-hover:scale-110 transition-transform" />
                ログアウト
              </button>
            )}

            <button
              onClick={handleSaveData}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200 group"
            >
              <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
              データ保存
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-gray-400 text-xs">
        <p>Built with Firebase Modular SDK (v9+) & Tailwind CSS</p>
      </div>
    </div>
  );
};

export default FirebaseDemo;
