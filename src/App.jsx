// This code is based on the modular structure and the "Modern-Industrial meets Historic Neighborhood" theme.

// ----------------------------------------------------------------------
// 1. FIREBASE & GEMINI CONFIGURATION (CRITICAL)
// ----------------------------------------------------------------------

// Using the provided, previously validated API key.
const firebaseConfig = {
    apiKey:  "AIzaSyCdTldrewnE05My-CKeZjtkTBGrhTLpGJM", 
    authDomain: "modular-todo-app.firebaseapp.com",
    projectId: "modular-todo-app",
    storageBucket: "modular-todo-app.firebasestorage.app",
    messagingSenderId: "1031540967708",
    appId: "1:1031540967708:web:e82e57074480d6753b92d9",
    measurementId: "G-D8E3P1H55X"
};

const appId = "modular-todo-app"; 
const initialAuthToken = null; 

// GEMINI API Configuration
const GEMINI_API_KEY = ""; // Kept empty to rely on canvas injection
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";


// ----------------------------------------------------------------------
// 2. REACT IMPORTS AND UTILITIES
// ----------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, doc, onSnapshot, collection, query, 
    addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, getDocs
} from 'firebase/firestore';
import { Trash2, CheckCircle, Circle, Loader, Settings, Sparkles, ListTodo, Check, Grid3X3, Lock } from 'lucide-react'; // Icon library

// Initialize Firebase App and Services (Declared with 'let' and initialized conditionally)
let app;
let db;
let auth;
let isInitialized = false;

const initFirebase = () => {
    if (!isInitialized) {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            isInitialized = true;
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
        }
    }
};

// ----------------------------------------------------------------------
// UTILITY FUNCTION: getCollectionPath (CRITICAL FOR COLLABORATION)
// ----------------------------------------------------------------------

/**
 * Defines the Firestore path based on the current app ID.
 * Since this is a shared list, we use the 'public/data' path.
 * @param {string} currentAppId 
 * @returns {string} The Firestore collection path.
 */
const getCollectionPath = (currentAppId) => {
    // This is the public, shared collection path for collaborative apps.
    return `artifacts/${currentAppId}/public/data/todos`;
};


// ----------------------------------------------------------------------
// UTILITY FUNCTION: fetchWithBackoff (For Gemini API Calls)
// ----------------------------------------------------------------------

const fetchWithBackoff = async (url, options, maxRetries = 5) => {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) { // Rate limit error
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                continue;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            // Retry on network errors or non-429 failures
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};

// ----------------------------------------------------------------------
// 3. MODULAR COMPONENT: TaskBreakdown (LLM-Powered)
// ----------------------------------------------------------------------

const TaskBreakdown = ({ taskText }) => {
    const [breakdown, setBreakdown] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const generateBreakdown = useCallback(async () => {
        setLoading(true);
        setError(null);
        setBreakdown(null);

        const systemPrompt = "You are an Industrial Project Foreman. Your goal is to take a single, complex task and break it down into 3 to 5 actionable, thematic, and specific sub-tasks. Present the output as a simple, numbered list. Do not include any introductory or concluding text, only the list items.";
        const userQuery = `Break down this complex industrial task: "${taskText}"`;

        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            const result = await fetchWithBackoff(GEMINI_API_URL + `?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (generatedText) {
                setBreakdown(generatedText);
            } else {
                setError("LLM provided no content for this task.");
            }
        } catch (e) {
            console.error("Gemini API Error:", e);
            setError("Failed to connect to the Gemini API for planning.");
        } finally {
            setLoading(false);
        }
    }, [taskText]);

    return (
        <div className="mt-2 pt-2 border-t border-stone-200">
            <button
                onClick={generateBreakdown}
                className="flex items-center text-sm text-amber-800 hover:text-amber-900 transition-colors disabled:opacity-50"
                disabled={loading}
            >
                <Sparkles size={16} className="mr-1" />
                {loading ? 'Generating Plan...' : 'Breakdown Task ✨'}
            </button>
            
            {(loading || breakdown || error) && (
                <div className="mt-2 p-3 bg-stone-50 border border-stone-200 rounded text-sm text-gray-700 whitespace-pre-wrap">
                    {loading && (
                        <div className="flex items-center">
                            <Loader size={16} className="animate-spin mr-2 text-amber-800" />
                            Analyzing blueprints...
                        </div>
                    )}
                    {error && <p className="text-red-600">Error: {error}</p>}
                    {breakdown && (
                        <>
                            <p className="font-semibold text-gray-800 mb-1">Foreman's Blueprint:</p>
                            {breakdown}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};


// ----------------------------------------------------------------------
// 4. MODULAR COMPONENT: TodoItem
// ----------------------------------------------------------------------

// *** CHANGE 2: ACCEPT isProUser PROP ***
const TodoItem = ({ todo, db, appId, isProUser }) => {
    // Uses the public path defined in getCollectionPath
    const docRef = doc(db, getCollectionPath(appId), todo.id);

    const cardClass = "flex flex-col p-4 mb-2 bg-white rounded-lg shadow-xl transition-all duration-200 border-l-4";
    const completedClass = "opacity-70 border-l-stone-400 line-through text-gray-500";
    const pendingClass = "border-l-amber-800 text-gray-800"; // Deep Copper Accent
    const textClass = todo.completed ? completedClass : pendingClass;

    const toggleComplete = useCallback(async () => {
        try {
            await updateDoc(docRef, { completed: !todo.completed });
        } catch (e) {
            console.error("Error toggling todo:", e);
        }
    }, [todo.completed, docRef]);

    const handleDelete = useCallback(async () => {
        // NOTE: Using window.confirm() here as a simple example, but a custom modal is preferred.
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await deleteDoc(docRef);
        } catch (e) {
            console.error("Error deleting todo:", e);
        }
    }, [docRef]);

    const handleProClick = () => {
        if (!window.confirm("This is a PRO feature! Upgrade your 'Business Buddy' subscription to unlock the Foreman's Blueprint and AI breakdown.")) {
            // Optional: redirect to a payment page here
        }
    };


    return (
        <div className={cardClass + " " + (todo.completed ? 'bg-stone-100' : 'bg-white hover:shadow-2xl')}>
            <div className="flex items-center justify-between">
                {/* Task Text and Icon */}
                <div className="flex items-center flex-1 min-w-0 mr-4">
                    <button 
                        onClick={toggleComplete} 
                        className="p-1 text-amber-800 hover:text-amber-900 transition-colors mr-3"
                        aria-label={todo.completed ? "Mark as Pending" : "Mark as Complete"}
                    >
                        {todo.completed 
                            ? <CheckCircle size={22} className="text-yellow-700" /> // Brass Check
                            : <Circle size={22} className="text-gray-400 hover:text-amber-800" /> // Copper outline hover
                        }
                    </button>
                    <span className={`text-lg font-medium truncate ${textClass}`}>
                        {todo.text}
                    </span>
                </div>

                {/* Delete Button */}
                <button 
                    onClick={handleDelete} 
                    className="p-1 text-gray-400 hover:text-amber-800 transition-colors"
                    aria-label="Delete Task"
                >
                    <Trash2 size={20} />
                </button>
            </div>
            
            {/* Task Breakdown Component (LLM Feature) */}
            {!todo.completed && (
                <div className="mt-2 pt-2 border-t border-stone-200">
                    {/* *** CONDITIONAL RENDERING: SHOW BREAKDOWN ONLY IF PRO *** */}
                    {isProUser ? (
                        <TaskBreakdown taskText={todo.text} />
                    ) : (
                        <button
                            onClick={handleProClick}
                            className="flex items-center text-sm text-gray-500 hover:text-amber-800 transition-colors"
                        >
                            <Lock size={16} className="mr-1 text-amber-500" />
                            Unlock Breakdown (Pro Feature)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ----------------------------------------------------------------------
// 5. MODULAR COMPONENT: TodoForm
// ----------------------------------------------------------------------

const TodoForm = ({ db, appId }) => {
    const [task, setTask] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Styling Update: Copper button and focused border
    const btnClass = "px-6 py-3 font-semibold text-white bg-amber-800 rounded-lg hover:bg-amber-900 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center";
    const inputClass = "flex-1 min-w-0 p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow";

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmedTask = task.trim();

        if (!trimmedTask || isSubmitting || !db) return;

        setIsSubmitting(true);
        // Uses the public path defined in getCollectionPath
        const sharedTodosCollection = collection(db, getCollectionPath(appId));
        
        try {
            await addDoc(sharedTodosCollection, {
                text: trimmedTask,
                completed: false,
                createdAt: serverTimestamp(),
            });
            setTask(''); // Clear input on success
        } catch (e) {
            console.error("Error adding document: ", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-4 p-4 bg-white rounded-xl shadow-2xl border border-stone-200">
            <input
                type="text"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Add a new industrial task..."
                className={inputClass}
                disabled={isSubmitting}
            />
            <button type="submit" className={btnClass} disabled={isSubmitting}>
                {isSubmitting ? <Loader size={20} className="animate-spin" /> : 'Add Task'}
            </button>
        </form>
    );
};


// ----------------------------------------------------------------------
// 6. MODULAR COMPONENT: SettingsModal
// ----------------------------------------------------------------------

const SettingsModal = ({ userId, db, appId, isProUser, setIsProUser, onClose }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Styling
    const buttonDanger = "px-4 py-2 font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center";
    const buttonToggle = "px-4 py-2 font-semibold text-white rounded-lg shadow-md flex items-center justify-center";

    const handleDeleteAll = async () => {
        if (!window.confirm("WARNING: Are you sure you want to delete ALL tasks? This action cannot be undone.")) {
            return;
        }

        setIsDeleting(true);
        try {
            // Deletes tasks from the public collection
            const q = collection(db, getCollectionPath(appId));
            const snapshot = await getDocs(q);
            
            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            
            console.log("All tasks successfully deleted.");
            onClose(); 
        } catch (e) {
            console.error("Error deleting all documents:", e);
            alert("Failed to delete all tasks. Check console for details.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full transform transition-all border-4 border-amber-800">
                <h2 className="text-3xl font-bold text-gray-800 mb-4 flex justify-between items-center">
                    User Settings
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-xl font-mono">×</button>
                </h2>
                <p className="text-gray-600 mb-6 border-b pb-4">
                    Manage your application data and user settings.
                </p>

                {/* Account Info */}
                <div className="mb-6 bg-stone-100 p-4 rounded-lg border border-stone-300">
                    <p className="font-semibold text-gray-700">Current User ID:</p>
                    <code className="block bg-white p-2 rounded text-sm text-gray-800 mt-1 break-all">{userId}</code>
                </div>

                {/* Pro Feature Toggle (for testing) */}
                <div className="mb-6 bg-yellow-50 p-4 rounded-lg border border-yellow-300">
                    <h3 className="text-xl font-bold text-yellow-700 mb-2">Subscription Management (Test)</h3>
                    <p className="text-yellow-600 mb-4">
                        Toggle this to test the Pro features access.
                    </p>
                    <button 
                        onClick={() => setIsProUser(!isProUser)} 
                        className={buttonToggle + (isProUser ? " bg-green-600 hover:bg-green-700" : " bg-gray-500 hover:bg-gray-600")}
                    >
                        {isProUser ? '✅ Pro User Active' : '🔓 Free User Active'}
                    </button>
                </div>


                {/* Danger Zone */}
                <div className="border border-red-300 bg-red-50 p-4 rounded-lg">
                    <h3 className="text-xl font-bold text-red-700 mb-2">Danger Zone</h3>
                    <p className="text-red-600 mb-4">
                        This action will permanently remove all **shared** tasks from the database.
                    </p>
                    <button onClick={handleDeleteAll} className={buttonDanger} disabled={isDeleting}>
                        {isDeleting ? <Loader size={20} className="animate-spin mr-2" /> : 'Delete All Tasks'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ----------------------------------------------------------------------
// 7. MAIN COMPONENT: App
// ----------------------------------------------------------------------

export default function App() {
    const [todos, setTodos] = useState([]);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [showSettings, setShowSettings] = useState(false); 
    const [filter, setFilter] = useState('all'); 
    
    // *** CHANGE 1: ADD isProUser STATE ***
    // In a real app, this would be fetched from Firestore based on the user ID.
    const [isProUser, setIsProUser] = useState(false); 

    // ------------------- AUTHENTICATION AND INITIALIZATION -------------------
    useEffect(() => {
        initFirebase();
        
        const signIn = async () => {
            try {
                if (auth && !auth.currentUser) { 
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase Sign-In Failed:", error);
            }
        };

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                // Future: Check Firestore for user's 'isPro' status here
            } else {
                setUserId(null);
            }
            setIsAuthReady(true);
        });
        
        if (auth) signIn(); 

        return () => unsubscribeAuth();
    }, []);

    // ------------------- FIRESTORE DATA LISTENER -------------------
    useEffect(() => {
        // Needs db and auth to be ready
        if (!isAuthReady || !db) {
            setTodos([]);
            return;
        }

        // Uses the new public collection path
        const todosCollectionRef = collection(db, getCollectionPath(appId));
        const q = query(todosCollectionRef); 

        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            const fetchedTodos = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Sort in memory by createdAt (descending) before setting state
            fetchedTodos.sort((a, b) => {
                const aTime = a.createdAt?.toMillis() || 0;
                const bTime = b.createdAt?.toMillis() || 0;
                return bTime - aTime;
            });

            setTodos(fetchedTodos);
        }, (error) => {
            console.error("Error listening to Firestore:", error);
        });

        return () => unsubscribeSnapshot();
    }, [isAuthReady]); 

    // Memoized Filtering Logic
    const filteredTodos = useMemo(() => {
        switch (filter) {
            case 'pending':
                return todos.filter(todo => !todo.completed);
            case 'completed':
                return todos.filter(todo => todo.completed);
            case 'all':
            default:
                return todos;
        }
    }, [todos, filter]);


    const appTitle = "Industrial-Historic Task List";
    const mainContainerClass = "max-w-4xl mx-auto p-4 sm:p-6 lg:p-8"; 
    
    // Aesthetic Update: Added a brick background image texture
    const themeBackground = "min-h-screen transition-colors p-8"
        + " bg-stone-100"
        + " bg-[url('https://www.transparenttextures.com/patterns/brick-wall.png')]"
        + " bg-opacity-70"; 

    if (!isAuthReady) {
        return (
            <div className={themeBackground + " flex items-center justify-center"}>
                <div className="flex flex-col items-center p-8 bg-white rounded-lg shadow-xl">
                    <Loader size={32} className="animate-spin text-amber-800" />
                    <p className="mt-4 text-lg text-gray-600">Initializing Database Connection...</p>
                </div>
            </div>
        );
    }
    
    // Check for configuration error 
    if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
        return (
            <div className={themeBackground + " flex items-center justify-center text-center"}>
                <div className="max-w-md p-8 bg-red-100 border border-red-500 text-red-700 rounded-lg shadow-xl">
                    <h2 className="text-2xl font-bold mb-4">Configuration Error!</h2>
                    <p className="mb-4">
                        Please ensure your Firebase configuration is correctly set.
                    </p>
                </div>
            </div>
        );
    }

    const filterOptions = [
        { key: 'all', label: 'All Tasks', icon: Grid3X3 },
        { key: 'pending', label: 'Pending', icon: ListTodo },
        { key: 'completed', label: 'Completed', icon: Check },
    ];


    return (
        <div className={themeBackground}>
            <div className={mainContainerClass}>
                
                {/* Header and Settings Button */}
                <header className="py-6 mb-6 text-center relative">
                    <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight">
                        {appTitle} {isProUser ? <span className="text-amber-800 text-xl">⭐PRO</span> : <span className="text-gray-500 text-xl">(Free)</span>}
                    </h1>
                    <p className="text-sm text-gray-500 mt-2 mb-4">
                        **Collaborative List** | User ID: <code className="font-mono text-xs bg-stone-300 p-1 rounded">{userId || "N/A"}</code>
                    </p>
                    {/* Settings Button (New Module Trigger) */}
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="absolute top-4 right-0 p-2 text-gray-500 hover:text-amber-800 transition-colors rounded-full bg-white shadow-md border border-stone-200"
                        aria-label="Open Settings"
                    >
                        <Settings size={20} />
                    </button>
                </header>

                {/* Task Input Form (Modular Component) */}
                <TodoForm db={db} appId={appId} />

                {/* Filter Bar (Responsive Layout) */}
                <div className="flex flex-wrap justify-center sm:justify-start gap-3 p-4 bg-white rounded-xl shadow-inner mb-6 border border-stone-200">
                    {filterOptions.map(option => {
                        const Icon = option.icon;
                        const isActive = filter === option.key;
                        return (
                            <button
                                key={option.key}
                                onClick={() => setFilter(option.key)}
                                className={`
                                    flex items-center px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200
                                    flex-grow sm:flex-grow-0
                                    ${isActive 
                                        ? 'bg-amber-800 text-white shadow-md' 
                                        : 'bg-stone-100 text-gray-700 hover:bg-stone-200'}
                                `}
                            >
                                <Icon size={16} className="mr-2" />
                                {option.label}
                            </button>
                        );
                    })}
                </div>


                {/* Task List */}
                <div className="mt-8 space-y-3">
                    {filteredTodos.length === 0 ? (
                        <p className="text-center text-gray-500 text-lg p-8 bg-white rounded-xl shadow-lg">
                            {filter === 'all' ? 
                                "No tasks found. Add your first industrial task above!" : 
                                `No ${filter} tasks to display.`
                            }
                        </p>
                    ) : (
                        filteredTodos.map(todo => (
                            // *** CHANGE 3: PASS isProUser PROP DOWN ***
                            <TodoItem 
                                key={todo.id} 
                                todo={todo} 
                                db={db} 
                                appId={appId} 
                                isProUser={isProUser}
                            />
                        ))
                    )}
                </div>

            </div>
            {/* Settings Modal - Also passing Pro state and setter for testing */}
            {showSettings && (
                <SettingsModal 
                    userId={userId} 
                    db={db} 
                    appId={appId} 
                    isProUser={isProUser}
                    setIsProUser={setIsProUser}
                    onClose={() => setShowSettings(false)} 
                />
            )}
        </div>
    );
}