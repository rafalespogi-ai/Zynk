import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  Timestamp,
  getDocFromServer,
  doc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { MessageSquare, Send, LogIn, LogOut, User as UserIcon, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
class ErrorBoundary extends React.Component<any, any> {
  state: any;
  props: any;

  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops! Error Occurred</h1>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App Component ---
interface Message {
  id: string;
  text: string;
  author: string;
  createdAt: Timestamp | null;
  uid?: string;
}

function MessageBoard() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setIsConnecting(false);
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
        setIsConnecting(false);
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listener
  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const messageData = {
      text: newMessage.trim(),
      author: user.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
      uid: user.uid
    };

    try {
      await addDoc(collection(db, 'messages'), messageData);
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    }
  };

  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-stone-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-stone-600 font-medium">Connecting to Board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans selection:bg-stone-900 selection:text-stone-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-stone-900 p-1.5 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Public Board</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Logged in as</p>
                  <p className="text-sm font-bold">{user.displayName}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-600"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-all active:scale-95 font-medium text-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Login with Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 pb-32">
        <div className="space-y-6">
          <AnimatePresence initial={false}>
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20 bg-white rounded-3xl border border-stone-200 border-dashed"
              >
                <MessageSquare className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <p className="text-stone-500">No messages yet. Be the first to post!</p>
              </motion.div>
            ) : (
              messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`flex flex-col ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-sm ${
                    msg.uid === user?.uid 
                      ? 'bg-stone-900 text-white rounded-tr-none' 
                      : 'bg-white text-stone-900 rounded-tl-none border border-stone-200'
                  }`}>
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${
                        msg.uid === user?.uid ? 'text-stone-400' : 'text-stone-500'
                      }`}>
                        {msg.author}
                      </span>
                      {msg.createdAt && (
                        <span className={`text-[10px] ${
                          msg.uid === user?.uid ? 'text-stone-500' : 'text-stone-400'
                        }`}>
                          {new Date(msg.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed break-words">
                      {msg.text}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-stone-200 p-4">
        <div className="max-w-4xl mx-auto">
          {user ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-stone-100 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-stone-900 transition-all outline-none"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="bg-stone-900 text-white p-3 rounded-2xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-stone-500 mb-2">Please login to post a message</p>
              <button 
                onClick={handleLogin}
                className="text-stone-900 font-bold text-sm underline underline-offset-4 hover:text-stone-700"
              >
                Login with Google
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MessageBoard />
    </ErrorBoundary>
  );
}
