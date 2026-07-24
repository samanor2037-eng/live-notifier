import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Bell, BellOff, Settings, Users, Radio, Video, Plus, Trash2, 
  Mail, Shield, RefreshCw, AlertCircle, Youtube, CheckCircle2, Play,
  Eye, EyeOff, ListVideo, GripVertical, Maximize, Minimize
} from 'lucide-react';

// Permissions delegated to TikTok embed iframes (set directly in JSX so they
// are present before the iframe's first navigation).
const TIKTOK_IFRAME_ALLOW = 'unload *; accelerometer *; gyroscope *; camera *; microphone *; magnetometer *; autoplay *; encrypted-media *; picture-in-picture *; web-share *';

// Synthesize a beautiful soft chime sound using Web Audio API
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // First note (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); 
    gain1.gain.setValueAtTime(0, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.45);

    // Second note (A5) slightly delayed
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime); 
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.45);
    }, 120);

  } catch (err) {
    console.error('Failed to play chime:', err);
  }
}

// Globally cache Supabase client to avoid creating multiple GoTrueClient instances on HMR/re-mounts
let cachedSupabase = null;

// Backend API base URL: set VITE_API_URL in production (e.g. Vercel env vars)
// to point at the deployed backend; falls back to localhost for local dev.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [supabase, setSupabase] = useState(null);
  const [channels, setChannels] = useState([]);
  const [smtp, setSmtp] = useState({
    provider: 'smtp',
    host: '',
    port: '587',
    user: '',
    pass: '',
    bird_api_key: '',
    bird_from: 'onboarding@messagebird.dev',
    gas_url: '',
    to_email: ''
  });
  
  // Form fields
  const [newChannel, setNewChannel] = useState({
    platform: 'youtube',
    identifier: '',
    name: ''
  });
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [isConfigured, setIsConfigured] = useState(false);
  
  // Track previous live states to trigger notifications on transition
  const prevLiveStatesRef = useRef({});

  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  
  // URL resolving states
  const [channelUrl, setChannelUrl] = useState('');
  const [resolvedChannel, setResolvedChannel] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [addMode, setAddMode] = useState('url'); // 'url' or 'manual'

  // Player & Notes states
  const [activePlayer, setActivePlayer] = useState(null); // { channel, type: 'live' | 'video', videoId }
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const ytPlayerRef = useRef(null);
  
  // Expanded Player features states
  const [showNotesPanel, setShowNotesPanel] = useState(true);
  const [noteInputPosition, setNoteInputPosition] = useState('sidebar'); // 'sidebar' or 'overlay'
  const [channelVideos, setChannelVideos] = useState([]);
  const [activeTabInModal, setActiveTabInModal] = useState('notes'); // 'notes' | 'playlist'
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [tiktokInputUrl, setTiktokInputUrl] = useState('');
  
  // Draggable & Fullscreen states
  const [overlayPos, setOverlayPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTrackingLive, setIsTrackingLive] = useState(false);
  const playerWrapperRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 20, y: 20 });
  const lastPlayerTimeRef = useRef(0);
  const lastPlayTimeRef = useRef({ playerTime: 0, wallTime: 0 });
  const [avatarErrors, setAvatarErrors] = useState({});

  const cleanAvatarUrl = (url) => {
    if (!url) return null;
    return url.replace(/&amp;/g, '&');
  };

  const [isYtApiReady, setIsYtApiReady] = useState(typeof window.YT !== 'undefined' && typeof window.YT.Player !== 'undefined');

  // Load YouTube Iframe Player API script dynamically and track load state
  useEffect(() => {
    const handleApiReady = () => {
      console.log("YouTube API Ready Event Fired!");
      setIsYtApiReady(true);
    };

    if (window.YT && window.YT.Player) {
      setIsYtApiReady(true);
    } else {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === 'function') previousCallback();
        handleApiReady();
      };
      
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }
    }
  }, []);

  // Sync isTrackingLive state when activePlayer changes
  useEffect(() => {
    if (activePlayer && activePlayer.type === 'live') {
      setIsTrackingLive(true);
    } else {
      setIsTrackingLive(false);
    }
  }, [activePlayer]);

  // Periodic Auto-Sync live tracking engine
  useEffect(() => {
    if (!activePlayer || activePlayer.type !== 'live' || !isTrackingLive) return;

    // Initialize baseline if player is already playing
    if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
      const curTime = ytPlayerRef.current.getCurrentTime();
      lastPlayTimeRef.current = {
        playerTime: curTime,
        wallTime: Date.now()
      };
      lastPlayerTimeRef.current = curTime;
    } else {
      lastPlayTimeRef.current = { playerTime: 0, wallTime: Date.now() };
      lastPlayerTimeRef.current = 0;
    }

    const interval = setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const currentTime = ytPlayerRef.current.getCurrentTime();
          
          // Detect manual seeks using time difference from the last interval check
          const lastTime = lastPlayerTimeRef.current || 0;
          const timeDiff = currentTime - lastTime;
          lastPlayerTimeRef.current = currentTime;

          const isInitialized = lastTime > 0;
          if (isInitialized && (timeDiff < -2 || timeDiff > 6)) {
            console.log(`Manual seek detected (diff: ${timeDiff}s). Disengaging auto-sync.`);
            setIsTrackingLive(false);
            return;
          }
          
          // Get player state: 1 = PLAYING, 3 = BUFFERING
          let isPlaying = false;
          if (typeof ytPlayerRef.current.getPlayerState === 'function') {
            isPlaying = (ytPlayerRef.current.getPlayerState() === 1);
          }

          if (isPlaying) {
            const elapsedWallTime = (Date.now() - lastPlayTimeRef.current.wallTime) / 1000;
            const expectedTime = lastPlayTimeRef.current.playerTime + elapsedWallTime;
            const drift = expectedTime - currentTime;

            // If player drifts behind wall clock by more than 6 seconds, auto catch up
            if (drift > 6) {
              console.log(`Auto-syncing live stream. Drift detected: ${Math.round(drift)}s`);
              ytPlayerRef.current.seekTo(999999, true);
              // Reset baseline
              lastPlayTimeRef.current = {
                playerTime: currentTime + drift,
                wallTime: Date.now()
              };
              lastPlayerTimeRef.current = currentTime + drift;
            }
          }
        } catch (e) {
          console.error("Auto-sync failed:", e);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activePlayer, isTrackingLive]);

  // Initialize Supabase Client dynamically from backend config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/config`);
        const data = await res.json();
        if (data.supabaseUrl && data.supabaseKey && !data.supabaseUrl.includes('your-supabase')) {
          if (!cachedSupabase || cachedSupabase.supabaseUrl !== data.supabaseUrl || cachedSupabase.supabaseKey !== data.supabaseKey) {
            cachedSupabase = createClient(data.supabaseUrl, data.supabaseKey);
            cachedSupabase.supabaseUrl = data.supabaseUrl;
            cachedSupabase.supabaseKey = data.supabaseKey;
          }
          setSupabase(cachedSupabase);
          setIsConfigured(true);
        } else {
          setSupabase(null);
          setIsConfigured(false);
        }
      } catch (err) {
        console.error("Failed to fetch Supabase config from backend:", err);
        setSupabase(null);
        setIsConfigured(false);
      }
    };
    loadConfig();
  }, []);

  // Monitor session and Google Sign-in state
  useEffect(() => {
    if (!supabase) return;
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Strip token details from URL hash if they exist
      if (session && window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))) {
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
      }
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Strip token details from URL hash if they exist
      if (session && window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))) {
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Load channels and SMTP settings when session is active
  useEffect(() => {
    if (!supabase || !session) return;
    
    fetchChannels();
    fetchSettings();

    // Trigger an immediate live-status check on load so the dashboard
    // reflects current status right away, without needing "Hubi Hadda".
    fetch(`${API_URL}/api/check`, { method: 'POST' })
      .then(() => fetchChannels())
      .catch(err => console.error("Failed to trigger auto check on load:", err));

    // Subscribe to Realtime database updates for this user's channels
    const channelSubscription = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'channels',
          filter: `user_id=eq.${session.user.id}`
        },
        (payload) => {
          console.log('Realtime DB Change:', payload);
          if (payload.eventType === 'UPDATE') {
            const updatedChannel = payload.new;
            const wasLive = prevLiveStatesRef.current[updatedChannel.id];
            
            if (updatedChannel.is_live && !wasLive) {
              if (soundEnabled) playChime();
              if (Notification.permission === 'granted') {
                new Notification(`🚨 ${updatedChannel.name} is LIVE!`, {
                  body: `${updatedChannel.name} just started streaming live on ${updatedChannel.platform}.`,
                  icon: '/favicon.ico'
                });
              }
              showToast(`${updatedChannel.name} is now LIVE!`);
            }
            
            setChannels(prev => prev.map(ch => ch.id === updatedChannel.id ? updatedChannel : ch));
            prevLiveStatesRef.current[updatedChannel.id] = updatedChannel.is_live;
          } else {
            fetchChannels();
          }
        }
      )
      .subscribe();

    // Fallback polling interval to guarantee UI updates immediately when backend updates DB
    const pollInterval = setInterval(fetchChannels, 10000);

    return () => {
      supabase.removeChannel(channelSubscription);
      clearInterval(pollInterval);
    };
  }, [supabase, session, soundEnabled]);

  // Request browser notification permissions
  useEffect(() => {
    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchChannels = async () => {
    try {
      if (!session) return;
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setChannels(data || []);
      
      // Store initial live states
      const states = {};
      data.forEach(ch => {
        states[ch.id] = ch.is_live;
      });
      prevLiveStatesRef.current = states;
    } catch (err) {
      showToast('Fashil: Ka soo kicinta kanaalada', 'error');
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('settings').select('*').eq('key', 'smtp_config');
      if (error) throw error;
      if (data && data.length > 0 && data[0].value) {
        setSmtp(data[0].value);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      showToast('Cabsida: Browser-kaan ma taageero notifications', 'error');
      return;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      showToast('Ogeysiisyada browser-ka waa la shiday!');
      new Notification("Social Live Notifier", {
        body: "Ogeysiisyada waa lagu guuleystay!"
      });
    } else {
      setNotificationsEnabled(false);
      showToast('Ogeysiisyada waa la diiday.', 'error');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      showToast(`Login failed: ${err.message}`, 'error');
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Fadlan geli email-ka iyo password-ka', 'error');
      return;
    }
    setIsLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
        showToast('Waa laguugu guuleystay soo galidda!');
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
        showToast('Waa laguugu guuleystay is-diiwaan-gelinta! Fadlan hubi email-kaaga.');
      }
    } catch (err) {
      showToast(`Cillad: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast('Waa laguu saaray akoonka (Logged Out).');
  };

  const handleResolveUrl = async (e) => {
    e.preventDefault();
    if (!channelUrl) {
      showToast('Fadlan geli link-ga kanaalka (URL)', 'error');
      return;
    }
    
    setIsResolving(true);
    setResolvedChannel(null);
    try {
      const res = await fetch(`${API_URL}/api/resolve-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channelUrl.trim() })
      });
      
      const data = await res.json();
      if (data.success) {
        setResolvedChannel(data.channel);
        showToast('Xogta waa la soo helay!');
      } else {
        showToast(`Cillad: ${data.error || 'Ma awoodo inaan soo qabto xogta'}`, 'error');
      }
    } catch (err) {
      showToast('Server-ka (Port 5001) ma shaqaynayo', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  const handleAddChannel = async (e) => {
    if (e) e.preventDefault();
    
    let platform, identifier, name, avatarUrl = null;
    
    if (addMode === 'url') {
      if (!resolvedChannel) {
        showToast('Fadlan marka hore hubi oo soo qabo xogta', 'error');
        return;
      }
      platform = resolvedChannel.platform;
      identifier = resolvedChannel.identifier;
      name = resolvedChannel.name;
      avatarUrl = resolvedChannel.avatar;
    } else {
      if (!newChannel.identifier || !newChannel.name) {
        showToast('Fadlan buuxi dhammaan meelaha banaan', 'error');
        return;
      }
      platform = newChannel.platform;
      identifier = newChannel.identifier.trim();
      name = newChannel.name.trim();
    }
    
    setIsLoading(true);
    try {
      const insertData = {
        platform,
        identifier,
        name,
        is_live: false,
        user_id: session.user.id
      };
      
      if (avatarUrl) {
        insertData.avatar_url = avatarUrl;
      }
      
      const { error } = await supabase.from('channels').insert([insertData]);
      
      if (error) throw error;
      
      showToast('Kanaalka waa la daray. Hubinta heerka ayaa bilaabatay...');
      setNewChannel({ platform: 'youtube', identifier: '', name: '' });
      setChannelUrl('');
      setResolvedChannel(null);
      fetchChannels();
      
      // Trigger status check immediately in the backend to resolve initial status
      fetch(`${API_URL}/api/check`, { method: 'POST' })
        .then(() => fetchChannels())
        .catch(err => console.error("Failed to trigger auto check:", err));
    } catch (err) {
      showToast('Fashil intii lagu jiray ku darista kanaalka', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChannel = async (id) => {
    try {
      const { error } = await supabase.from('channels').delete().eq('id', id);
      if (error) throw error;
      showToast('Kanaalka waa la tirtiray.');
      fetchChannels();
    } catch (err) {
      showToast('Fashil: Tirtirista kanaalka', 'error');
    }
  };

  // Extract YouTube video ID
  const extractYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Extract TikTok video ID
  const extractTikTokId = (url) => {
    if (!url) return null;
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  };

  // Fetch video notes from Supabase
  const fetchNotes = async (channelId, videoId) => {
    try {
      const { data, error } = await supabase
        .from('video_notes')
        .select('*')
        .eq('channel_id', channelId)
        .eq('video_id', videoId)
        .order('timestamp_seconds', { ascending: true });
      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Error fetching notes:', err.message);
    }
  };

  // Add a note with the current timestamp
  const handleAddNote = async (e) => {
    if (e) e.preventDefault();
    if (!newNoteText.trim() || !activePlayer) return;

    let timestampSeconds = 0;
    // Only get timestamp if it's a recorded video and player is ready
    if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
      try {
        timestampSeconds = Math.floor(ytPlayerRef.current.getCurrentTime());
      } catch (err) {
        console.error('Failed to get video time:', err);
      }
    }

    try {
      const { error } = await supabase.from('video_notes').insert([
        {
          user_id: session.user.id,
          channel_id: activePlayer.channel.id,
          video_id: activePlayer.videoId,
          timestamp_seconds: timestampSeconds,
          note_text: newNoteText.trim()
        }
      ]);
      if (error) throw error;
      setNewNoteText('');
      // Reset any auto-expanded textarea heights back to defaults
      document.querySelectorAll('.note-input-overlay textarea, .player-modal-body textarea').forEach(el => {
        el.style.height = el.classList.contains('overlay-textarea') ? '36px' : '40px';
      });
      fetchNotes(activePlayer.channel.id, activePlayer.videoId);
      showToast('Qoraalkii note-ka waa la kaydiyay!');
    } catch (err) {
      showToast('Cillad intii lagu jiray kaydinta note-ka', 'error');
    }
  };

  // Delete a note
  const handleDeleteNote = async (noteId) => {
    try {
      const { error } = await supabase.from('video_notes').delete().eq('id', noteId);
      if (error) throw error;
      if (activePlayer) {
        fetchNotes(activePlayer.channel.id, activePlayer.videoId);
      }
      showToast('Note-kii waa la tirtiray.');
    } catch (err) {
      showToast('Cillad intii lagu jiray tirtirista note-ka', 'error');
    }
  };

  // Format seconds to MM:SS
  const formatTimestamp = (secs) => {
    if (secs === 0) return '00:00';
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Seek YouTube Player to timestamp
  const seekPlayerTo = (seconds) => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      try {
        setIsTrackingLive(false); // Stop tracking live edge if user manually seeks to a past timestamp!
        ytPlayerRef.current.seekTo(seconds, true);
        ytPlayerRef.current.playVideo();
      } catch (err) {
        console.error('Failed to seek video:', err);
      }
    }
  };

  // Helper to boundary-check and update overlay position
  const updatePosition = (dx, dy) => {
    const container = playerWrapperRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    let newX = dragOffset.current.x + dx;
    let newY = dragOffset.current.y + dy;
    
    // Constrain within the bounds of the player column container
    newX = Math.max(10, Math.min(newX, rect.width - 330));
    newY = Math.max(10, Math.min(newY, rect.height - 65));
    
    setOverlayPos({ x: newX, y: newY });
  };

  // Draggable Input overlay mouse down handler
  const handleDragMouseDown = (e) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { ...overlayPos };
    e.preventDefault();
  };

  // Draggable Input overlay touch start handler (for mobile/tablet)
  const handleDragTouchStart = (e) => {
    setIsDragging(true);
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    dragOffset.current = { ...overlayPos };
    // Prevent defaults specifically for dragging handle to prevent scrolling while dragging
    e.preventDefault();
  };

  // Dragging movement listener for mouse and touch events
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      updatePosition(dx, dy);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;
      updatePosition(dx, dy);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

  // Helper to seek YouTube live player to the current live edge
  const goBackToLiveEdge = () => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      try {
        setIsTrackingLive(true); // Re-engage live edge tracking!
        ytPlayerRef.current.seekTo(999999, true);
        if (typeof ytPlayerRef.current.playVideo === 'function') {
          ytPlayerRef.current.playVideo();
        }
        showToast('Waxaad ku laabatay halka live-ku hadda marayo!');
      } catch (err) {
        console.error("Failed to seek to live edge:", err);
      }
    } else {
      showToast('Player-ku weli ma diyaarsana ama ma taageerayo live seek-ga', 'warning');
    }
  };

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    const wrapper = playerWrapperRef.current;
    if (!wrapper) return;

    if (!document.fullscreenElement) {
      wrapper.requestFullscreen().catch(err => {
        console.error("Fullscreen failed:", err.message);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Helper to keep overlay position within bounding box
  const constrainPositionInBounds = () => {
    const container = playerWrapperRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    setOverlayPos(prev => {
      const newX = Math.max(10, Math.min(prev.x, rect.width - 330));
      const newY = Math.max(10, Math.min(prev.y, rect.height - 65));
      return { x: newX, y: newY };
    });
  };

  // Monitor fullscreen change events
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Wait for layout resize to settle, then adjust boundaries
      setTimeout(constrainPositionInBounds, 150);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Monitor sidebar visibility to adjust overlay bounds
  useEffect(() => {
    if (activePlayer) {
      setTimeout(constrainPositionInBounds, 150);
    }
  }, [showNotesPanel]);

  // Fetch all latest videos for the active channel. Merges with whatever is
  // already in the list (pasted-link videos, noted videos) instead of wiping
  // it, since TikTok only ever returns its latest 10 videos.
  const fetchChannelVideos = async (channelId, platform, identifier) => {
    setIsLoadingVideos(true);
    try {
      const res = await fetch(`${API_URL}/api/channel-videos?channel_id=${identifier}&platform=${platform}`);
      const data = await res.json();
      if (data.success) {
        const fetched = data.videos || [];
        setChannelVideos(prev => {
          const fetchedIds = new Set(fetched.map(v => v.id));
          const extras = prev.filter(v => !fetchedIds.has(v.id));
          return [...fetched, ...extras];
        });
      } else {
        console.error("Failed to fetch videos:", data.error);
      }
    } catch (err) {
      console.error("Error fetching channel videos:", err.message);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  // Add a video to the list if it isn't already there -- used for pasted
  // links and for videos that have notes but rolled off TikTok's "latest 10".
  const addVideoIfMissing = (id, extra = {}) => {
    if (!id) return;
    setChannelVideos(prev => {
      if (prev.some(v => v.id === id)) return prev;
      
      let thumb = extra.thumbnail || null;
      if (!thumb && activePlayer) {
        if (activePlayer.channel.platform === 'youtube') {
          thumb = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
        } else if (activePlayer.channel.platform === 'tiktok') {
          thumb = activePlayer.channel.avatar_url || '';
        }
      }

      return [{ id, title: extra.title || 'Muuqaal la geliyay', url: extra.url || null, published: null, thumbnail: thumb }, ...prev];
    });
  };

  // Videos the user has taken notes on should always stay visible in the
  // list, even after they roll off TikTok's "latest 10" videos.
  const fetchNotedVideoIds = async (channelId) => {
    try {
      const { data, error } = await supabase
        .from('video_notes')
        .select('video_id')
        .eq('channel_id', channelId);
      if (error) throw error;
      const ids = [...new Set((data || []).map(n => n.video_id).filter(Boolean))];
      ids.forEach(id => addVideoIfMissing(id, { title: 'Muuqaal note leh' }));
    } catch (err) {
      console.error('Error fetching noted video ids:', err.message);
    }
  };

  // Monitor activePlayer to fetch notes
  useEffect(() => {
    if (supabase && activePlayer) {
      fetchNotes(activePlayer.channel.id, activePlayer.videoId);
    }
  }, [supabase, activePlayer]);

  // Fetch playlist when watch modal is opened
  useEffect(() => {
    if (activePlayer && ['youtube', 'tiktok'].includes(activePlayer.channel.platform) && channelVideos.length === 0) {
      fetchChannelVideos(activePlayer.channel.id, activePlayer.channel.platform, activePlayer.channel.identifier);
    }
  }, [activePlayer]);

  // Pull in any TikTok videos the user has notes on, so they stay in the list
  // even once TikTok's "latest 10" moves on without them.
  useEffect(() => {
    if (supabase && activePlayer && activePlayer.channel.platform === 'tiktok') {
      fetchNotedVideoIds(activePlayer.channel.id);
    }
  }, [supabase, activePlayer?.channel?.id, activePlayer?.channel?.platform]);

  // Reset player configuration when modal is closed
  useEffect(() => {
    if (!activePlayer) {
      setChannelVideos([]);
      setActiveTabInModal('notes');
      setShowNotesPanel(true);
      setNoteInputPosition('sidebar');
      setOverlayPos({ x: 20, y: 20 });
      if (document.fullscreenElement) {
        try {
          document.exitFullscreen();
        } catch (e) {}
      }
    }
  }, [activePlayer]);

  // Handle YT Player initialization and cleanup
  useEffect(() => {
    let playerInstance = null;
    
    if (activePlayer && activePlayer.channel.platform === 'youtube') {
      const container = document.getElementById('yt-player-iframe');
      console.log("YT Player Hook (Sync) - Container found:", !!container, "window.YT:", !!window.YT, "Player constructor:", !!(window.YT && window.YT.Player));
      if (!container) return;

      try {
        const initPlayer = () => {
          console.log("Instantiating YT.Player sync on existing iframe...");
          playerInstance = new window.YT.Player('yt-player-iframe', {
            events: {
              onReady: (event) => {
                console.log("YT Player is ready event fired sync!");
                ytPlayerRef.current = event.target;
              },
              onStateChange: (event) => {
                console.log("YT Player state changed sync:", event.data);
              }
            }
          });
        };

        if (window.YT && window.YT.Player) {
          initPlayer();
        } else {
          const previousCallback = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            if (typeof previousCallback === 'function') previousCallback();
            initPlayer();
          };
        }
      } catch (err) {
        console.error("Failed to initialize YT Player sync:", err);
      }

      return () => {
        if (playerInstance && typeof playerInstance.destroy === 'function') {
          try {
            playerInstance.destroy();
          } catch (e) {}
        }
        ytPlayerRef.current = null;
      };
    }
  }, [activePlayer, isYtApiReady]);

  const handleSaveSMTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.from('settings').upsert({
        key: 'smtp_config',
        value: {
          ...smtp,
          to_email: session?.user?.email
        }
      });
      
      if (error) throw error;
      showToast('Settings-ka waa la kaydiyay!');
    } catch (err) {
      showToast('Fashil: Kaydinta settings-ka', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerManualCheck = async () => {
    setIsLoading(true);
    try {
      // Connect to the local backend port 5001
      const res = await fetch(`${API_URL}/api/check`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast('Hubinta hadda waa la bilaabay!');
      fetchChannels();
    } catch (err) {
      showToast('Ma awoodo inaan la xiriiro Server-ka (Port 5001)', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestEmail = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/send-test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          smtp_config: {
            ...smtp,
            to_email: session?.user?.email
          } 
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Email tijaabo ah ayaa laguu soo diray!');
      } else {
        showToast(`Cillad: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Server-ka (Port 5001) ma shaqaynayo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
        {/* Toast Notification */}
        {toast && (
          <div className={`toast ${toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
            {toast.type === 'error' ? <AlertCircle color="#ff3b30" /> : <CheckCircle2 color="#007aff" />}
            <span>{toast.message}</span>
          </div>
        )}
        
        <div className="glass-card" style={{ maxWidth: '420px', width: '100%', padding: '40px 30px' }}>
          <div className="text-center" style={{ marginBottom: '30px' }}>
            <Radio className="mx-auto mb-4 animate-pulse" color="#ff3b30" size={64} style={{ margin: '0 auto 15px auto' }} />
            <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '10px' }}>Social Live Notifier</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              La soco marka dadka aad rabto ay Live galaan ama muuqaal cusub soo dhigaan.
            </p>
          </div>

          <form onSubmit={handleEmailAuth} style={{ marginBottom: '24px' }}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Email-ka</label>
              <input 
                type="email" 
                className="input-field" 
                placeholder="email@tusaale.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ marginBottom: '4px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Password-ka</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ marginBottom: '4px' }}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoading} style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {isLoading ? 'Fadlan sug...' : authMode === 'login' ? 'Soo Gal' : 'Abuur Akoonka'}
            </button>
          </form>

          <div className="text-center" style={{ marginBottom: '24px', fontSize: '0.85rem' }}>
            {authMode === 'login' ? (
              <p style={{ color: 'var(--text-muted)' }}>
                Miyaanad lahayn akoon?{' '}
                <button type="button" onClick={() => setAuthMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  Halkan ka abuur (Sign Up)
                </button>
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>
                Horey ma u lahayd akoon?{' '}
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  Halkan ka soo gal (Log In)
                </button>
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-dimmed)', fontSize: '0.8rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--card-border)' }}></div>
            <span style={{ padding: '0 10px' }}>AMA</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--card-border)' }}></div>
          </div>

          <button type="button" className="btn btn-action w-full flex items-center justify-center gap-3 py-3" onClick={handleGoogleLogin} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px', borderRadius: '8px', fontSize: '1rem', border: '1px solid var(--card-border)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M12.24 10.285V14.4h6.887C18.2 16.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.706 0 3.257.618 4.47 1.637l3.202-3.202C17.996 1.054 15.26 0 12.24 0 5.58 0 0 5.58 0 12.24s5.58 12.24 12.24 12.24c6.76 0 11.76-4.76 11.76-11.76 0-.796-.08-1.571-.22-2.315h-11.54z"/>
            </svg>
            Geli Akoonka Google (Sign In)
          </button>
          <p className="text-center" style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '12px', lineHeight: '1.4' }}>
            * Xusuusin: Google Sign-in wuxuu u baahan yahay in laga shido Supabase Dashboard-kaaga.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
          {toast.type === 'error' ? <AlertCircle color="#ff3b30" /> : <CheckCircle2 color="#007aff" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header-title-section">
          <h1><Radio className="animate-pulse" color="#ff3b30" size={32} /> Social Live Notifier</h1>
          <p>La soco marka qof aad rabto uu Live galo ama muuqaal cusub soo dhigo YouTube & TikTok</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>Wuxuu u furan yahay: <strong>{session.user.email}</strong></span>
            <span>•</span>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff3b30', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
              Ka Bax (Log Out)
            </button>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button className="btn-action" onClick={triggerManualCheck} disabled={isLoading || !isConfigured}>
            <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            Hubi Hadda
          </button>
          
          <button className="btn-action" onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Bell size={16} color="#34c759" /> : <BellOff size={16} color="#8e8e93" />}
            Dhawaaq: {soundEnabled ? 'ON' : 'OFF'}
          </button>
          
          <button 
            className={`btn-action ${notificationsEnabled ? 'text-green-500' : 'text-gray-400'}`} 
            onClick={requestNotificationPermission}
          >
            <Bell size={16} />
            Push Alert
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Users size={16} style={{ marginRight: '6px', display: 'inline' }} />
          Dashboard
        </button>
        <button 
          className={`tab-btn ${activeTab === 'manager' ? 'active' : ''}`}
          onClick={() => setActiveTab('manager')}
        >
          <Plus size={16} style={{ marginRight: '6px', display: 'inline' }} />
          Ku dar Kanaal
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={16} style={{ marginRight: '6px', display: 'inline' }} />
          Settings
        </button>
      </div>

      {/* Main Content */}
      {!isConfigured ? (
        <div className="glass-card text-center py-12">
          <AlertCircle className="mx-auto mb-4" size={48} color="#007aff" />
          <h2 className="text-xl font-bold mb-2">Supabase Lama Dheeg-gelin!</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Fadlan geli xogta Supabase-kaaga (URL iyo Anon Key) ee Settings si aad u bilowdo isticmaalka app-ka.
          </p>
          <button className="btn btn-primary" onClick={() => setActiveTab('settings')}>
            Geli Settings
          </button>
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <div>
              {channels.length === 0 ? (
                <div className="glass-card empty-state">
                  <Youtube size={48} />
                  <h3>Weli ma jiraan kanaalo aad la socoto</h3>
                  <p className="mt-2">Guji "Ku dar Kanaal" si aad u bilowdo</p>
                </div>
              ) : (
                <div className="channels-grid">
                  {channels.map((channel) => (
                    <div key={channel.id} className={`glass-card channel-card ${channel.is_live ? 'is-live' : ''}`}>
                      <div className="channel-header">
                        <span className={`channel-platform ${channel.platform === 'youtube' ? 'platform-youtube' : 'platform-tiktok'}`}>
                          {channel.platform}
                        </span>
                        
                        <span className={`status-badge ${channel.is_live ? 'status-live' : 'status-offline'}`}>
                          {channel.is_live ? '🔴 LIVE' : 'OFFLINE'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                        {channel.avatar_url && !avatarErrors[channel.id] ? (
                          <img 
                            src={cleanAvatarUrl(channel.avatar_url)} 
                            alt={channel.name} 
                            className="channel-avatar"
                            onError={() => setAvatarErrors(prev => ({ ...prev, [channel.id]: true }))}
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.08)' }}
                          />
                        ) : (
                          <div className="channel-avatar-placeholder" style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                            {channel.name ? channel.name.charAt(0) : '@'}
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="channel-name" style={{ margin: 0, fontSize: '1.2rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{channel.name}</div>
                          <div className="channel-identifier" style={{ margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            ID: {channel.identifier}
                          </div>
                        </div>
                      </div>
                      
                      <div className="channel-info-row">
                        <div>
                          <div className="info-label">Check-gii Ugu Dambeeyay</div>
                          <div className="info-value">
                            {channel.last_checked ? new Date(channel.last_checked).toLocaleTimeString() : 'Weli lama hubin'}
                          </div>
                        </div>
                        
                        {channel.last_video_url && (
                          <div>
                            <div className="info-label">Muuqaalkii Ugu Dambeeyay</div>
                            <div className="info-value">
                              <a href={channel.last_video_url} target="_blank" rel="noopener noreferrer">
                                Booqo Muuqaalka
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        {channel.is_live ? (
                          <button 
                            type="button"
                            className="btn btn-primary" 
                            style={{ flex: 1, padding: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            onClick={() => setActivePlayer({ 
                              channel, 
                              type: 'live', 
                              videoId: channel.platform === 'youtube' ? channel.identifier : null 
                            })}
                          >
                            <Play size={14} /> Daawo Live-ka
                          </button>
                        ) : (
                          <button 
                            type="button"
                            className="btn btn-action" 
                            style={{ flex: 1, padding: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px solid var(--card-border)' }}
                            onClick={() => {
                              const vId = channel.last_video_url 
                                ? (channel.platform === 'youtube' 
                                    ? extractYouTubeId(channel.last_video_url) 
                                    : extractTikTokId(channel.last_video_url))
                                : null;
                              setActivePlayer({ 
                                channel, 
                                type: 'video', 
                                videoId: vId 
                              });
                            }}
                          >
                            <Video size={14} /> Daawo Muuqaalada
                          </button>
                        )}
                      </div>

                      <button type="button" className="btn-delete" onClick={() => handleDeleteChannel(channel.id)} style={{ width: 'fit-content', alignSelf: 'flex-end', marginTop: '12px' }}>
                        <Trash2 size={14} style={{ display: 'inline', marginRight: '4px' }} /> Tirtir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manager' && (
            <div className="glass-card max-w-lg mx-auto">
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '20px' }}>Ku dar Kanaal Cusub</h2>
              
              {/* Mode Toggle Tabs */}
              <div className="tabs" style={{ display: 'flex', width: '100%', marginBottom: '24px' }}>
                <button 
                  type="button"
                  className={`tab-btn ${addMode === 'url' ? 'active' : ''}`}
                  onClick={() => { setAddMode('url'); setResolvedChannel(null); }}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  Ku dar Link (URL)
                </button>
                <button 
                  type="button"
                  className={`tab-btn ${addMode === 'manual' ? 'active' : ''}`}
                  onClick={() => { setAddMode('manual'); setResolvedChannel(null); }}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  Ku dar Gacanta (Manual)
                </button>
              </div>

              {addMode === 'url' ? (
                <div>
                  <form onSubmit={handleResolveUrl} style={{ marginBottom: '20px' }}>
                    <div className="form-group">
                      <label>Geli Link-ga Kanaalka (Channel URL)</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <input 
                          type="text" 
                          className="input-field"
                          placeholder="Tusaale: https://www.youtube.com/@Google"
                          value={channelUrl}
                          onChange={(e) => setChannelUrl(e.target.value)}
                          style={{ margin: 0, flex: 1 }}
                        />
                        <button type="submit" className="btn btn-action" disabled={isResolving} style={{ height: '48px', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isResolving ? 'Hubinaya...' : 'Hubi Link-ga'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        * Waxaa la taageerayaa link-yada YouTube-ka (Channel ama Handle) iyo TikTok profiles.
                      </p>
                    </div>
                  </form>

                  {/* Channel Preview Card */}
                  {resolvedChannel && (
                    <div className="resolved-preview-card" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: resolvedChannel.platform === 'youtube' ? '1px solid rgba(255, 59, 48, 0.2)' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '24px',
                      boxShadow: resolvedChannel.platform === 'youtube' ? '0 0 15px rgba(255, 59, 48, 0.05)' : 'none'
                    }}>
                      <div style={{ position: 'relative' }}>
                        {resolvedChannel.avatar && !avatarErrors.preview ? (
                          <img 
                            src={cleanAvatarUrl(resolvedChannel.avatar)} 
                            alt={resolvedChannel.name} 
                            onError={() => setAvatarErrors(prev => ({ ...prev, preview: true }))}
                            style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }}
                          />
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {resolvedChannel.name ? resolvedChannel.name.charAt(0) : '@'}
                          </div>
                        )}
                        <span className={`channel-platform ${resolvedChannel.platform === 'youtube' ? 'platform-youtube' : 'platform-tiktok'}`} style={{
                          position: 'absolute',
                          bottom: '-6px',
                          right: '-6px',
                          fontSize: '0.6rem',
                          padding: '2px 6px',
                        }}>
                          {resolvedChannel.platform}
                        </span>
                      </div>
                      
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {resolvedChannel.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          ID: {resolvedChannel.identifier}
                        </div>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => handleAddChannel()} 
                    className="btn btn-primary w-full" 
                    disabled={isLoading || !resolvedChannel}
                    style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Plus size={18} />
                    {isLoading ? 'Lagu darayaa...' : 'Ku Dar Kanaalka'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddChannel}>
                  <div className="form-group">
                    <label>Bar-bulsho (Platform)</label>
                    <select 
                      className="select-field"
                      value={newChannel.platform}
                      onChange={(e) => setNewChannel({...newChannel, platform: e.target.value})}
                    >
                      <option value="youtube">YouTube</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Identifer (YouTube Channel ID / TikTok Username)</label>
                    <input 
                      type="text" 
                      className="input-field"
                      placeholder={newChannel.platform === 'youtube' ? 'Tusaale: UC_x5XG1OV2P6uYZ5ji9FzGg' : 'Tusaale: khaby.lame'}
                      value={newChannel.identifier}
                      onChange={(e) => setNewChannel({...newChannel, identifier: e.target.value})}
                    />
                    {newChannel.platform === 'youtube' && (
                      <p className="text-xs text-gray-400 mt-1" style={{ fontSize: '0.8rem', marginTop: '-10px', marginBottom: '15px', color: 'var(--text-muted)' }}>
                        * Fiiro gaar ah: YouTube u isticmaal **Channel ID-ga rasmiga ah** (ka bilaabma UC...) ee ha isticmaalin handle-ka (@name).
                      </p>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label>Magaca Qofka (Display Name)</label>
                    <input 
                      type="text" 
                      className="input-field"
                      placeholder="Geli magaca aad u bixinayso"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel({...newChannel, name: e.target.value})}
                    />
                  </div>
                  
                  <button type="submit" className="btn btn-primary w-full flex items-center justify-center gap-2" disabled={isLoading} style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Plus size={18} />
                    {isLoading ? 'Lagu darayaa...' : 'Ku Dar'}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-2xl mx-auto">
          {/* E-Mail Settings */}
          <div className="glass-card">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Mail color="#007aff" /> E-Mail Notification Settings
            </h2>
            
            <form onSubmit={handleSaveSMTP}>
              <div className="form-group">
                <label>Habka loo dirayo E-Mail-ka (Email Provider)</label>
                <select 
                  className="select-field"
                  value={smtp.provider || 'smtp'}
                  onChange={(e) => setSmtp({...smtp, provider: e.target.value})}
                >
                  <option value="smtp">SMTP (Gmail, Outlook, etc.)</option>
                  <option value="bird">Bird API (Messagebird)</option>
                  <option value="gas">Google Apps Script (Bilaash & Fudud)</option>
                </select>
              </div>

              {smtp.provider === 'gas' ? (
                <>
                  <div className="form-group">
                    <label>Google Apps Script Web App URL</label>
                    <input 
                      type="text" 
                      className="input-field"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={smtp.gas_url || ''}
                      onChange={(e) => setSmtp({...smtp, gas_url: e.target.value})}
                    />
                  </div>

                  <div className="mt-4 p-4 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-400" style={{ fontSize: '0.85rem', lineHeight: '1.4rem', marginBottom: '20px' }}>
                    <p className="font-semibold text-white mb-2">Sida loo diyaariyo Google Apps Script:</p>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>Aad <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{color: '#007aff', textDecoration: 'underline'}}>script.google.com</a> oo ku abuur akoon/mashruuc cusub.</li>
                      <li>Ku shub (paste) koodhkan hoose:
                        <pre style={{background: '#000', padding: '12px', borderRadius: '6px', marginTop: '6px', overflowX: 'auto', color: '#34c759', fontFamily: 'monospace'}}>
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    MailApp.sendEmail({
      to: data.to,
      subject: data.subject,
      htmlBody: data.html
    });
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`}
                        </pre>
                      </li>
                      <li>Guji <strong>Deploy</strong> &rarr; <strong>New Deployment</strong> (dhinaca sare).</li>
                      <li>Dooro <strong>Web App</strong> (calamada gear-ka hadii uusan doorneen).</li>
                      <li>U dooro Execute As: <strong>Me</strong> iyo Who has access: <strong>Anyone</strong> (tani waa muhiim).</li>
                      <li>Guji <strong>Deploy</strong>, dabadeed oggolaanshaha sii (Authorize access), nuqul ka qaado <strong>Web App URL</strong> oo ku dheji sanduuqa sare.</li>
                    </ol>
                  </div>
                </>
              ) : (!smtp.provider || smtp.provider === 'smtp') ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label>SMTP Host</label>
                      <input 
                        type="text" 
                        className="input-field"
                        placeholder="smtp.gmail.com"
                        value={smtp.host || ''}
                        onChange={(e) => setSmtp({...smtp, host: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>SMTP Port</label>
                      <input 
                        type="text" 
                        className="input-field"
                        placeholder="587"
                        value={smtp.port || ''}
                        onChange={(e) => setSmtp({...smtp, port: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>SMTP User (Email-ka wax laga dirayo)</label>
                    <input 
                      type="email" 
                      className="input-field"
                      placeholder="tusaale@gmail.com"
                      value={smtp.user || ''}
                      onChange={(e) => setSmtp({...smtp, user: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>SMTP App Password</label>
                    <input 
                      type="password" 
                      className="input-field"
                      placeholder="••••••••••••••••"
                      value={smtp.pass || ''}
                      onChange={(e) => setSmtp({...smtp, pass: e.target.value})}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Bird API Key</label>
                    <input 
                      type="password" 
                      className="input-field"
                      placeholder="bk_eu1_..."
                      value={smtp.bird_api_key || ''}
                      onChange={(e) => setSmtp({...smtp, bird_api_key: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Bird From Email (Email-ka wax laga dirayo)</label>
                    <input 
                      type="text" 
                      className="input-field"
                      placeholder="onboarding@messagebird.dev"
                      value={smtp.bird_from || ''}
                      onChange={(e) => setSmtp({...smtp, bird_from: e.target.value})}
                    />
                  </div>
                </>
              )}
              
              <div className="form-group">
                <label>Email-kaaga (Laguugu soo dirayo ogeysiiska)</label>
                <input 
                  type="email" 
                  className="input-field"
                  value={session?.user?.email || ''}
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed', backgroundColor: 'rgba(255,255,255,0.05)' }}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-10px', marginBottom: '15px' }}>
                  * Ogeysiisyada waxaa loo diri doonaa emailkaaga Google ee kor ku qoran.
                </p>
              </div>
              
              <div className="flex gap-4">
                <button type="submit" className="btn btn-primary flex-1" disabled={isLoading || !isConfigured}>
                  Kaydi Settings-ka
                </button>
                <button type="button" className="btn-action flex-1 justify-center" onClick={sendTestEmail} disabled={isLoading || !isConfigured}>
                  Tijaabi Email-ka
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Player & Notes Modal Overlay */}
      {activePlayer && (
        <div className="player-modal-overlay">
          <div className="player-modal-container">
            {/* Modal Header */}
            <div className="player-modal-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '200px' }}>
                {activePlayer.videoId && (
                  <button
                    type="button"
                    className="btn btn-action"
                    onClick={() => {
                      setActivePlayer(prev => ({ ...prev, videoId: null }));
                      setNewNoteText('');
                    }}
                    style={{ height: '32px', padding: '0 10px', fontSize: '0.8rem', gap: '4px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--card-border)', marginRight: '4px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    ← Dib
                  </button>
                )}
                {activePlayer.channel.avatar_url && (
                  <img 
                    src={activePlayer.channel.avatar_url} 
                     alt={activePlayer.channel.name} 
                     style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {activePlayer.channel.name}
                </h3>
              </div>
              
              {/* Controls and Settings Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {/* Note Position Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Note Input:</span>
                  <select 
                    value={noteInputPosition}
                    onChange={(e) => setNoteInputPosition(e.target.value)}
                    style={{
                      background: '#111422',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      color: 'white',
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      height: '32px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="sidebar">Sidebar (Dhinaca)</option>
                    {activePlayer.videoId && <option value="overlay">Overlay (Dul-sabeeya - Draggable)</option>}
                  </select>
                </div>

                {/* Sidebar Toggle Button */}
                <button 
                  type="button" 
                  className="btn-action" 
                  onClick={() => setShowNotesPanel(!showNotesPanel)}
                  style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', gap: '6px' }}
                >
                  {showNotesPanel ? (
                    <>
                      <EyeOff size={14} /> Qari Sidebar
                    </>
                  ) : (
                    <>
                      <Eye size={14} /> Muuji Sidebar
                    </>
                  )}
                </button>

                {/* Fullscreen Button */}
                <button 
                  type="button" 
                  className="btn-action" 
                  onClick={toggleFullscreen}
                  style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', gap: '6px' }}
                >
                  {isFullscreen ? (
                    <>
                      <Minimize size={14} /> Exit Fullscreen
                    </>
                  ) : (
                    <>
                      <Maximize size={14} /> Fullscreen
                    </>
                  )}
                </button>

                {/* Ku laabo Live-ka Button */}
                {activePlayer.type === 'live' && activePlayer.channel.platform === 'youtube' && activePlayer.videoId && (
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={goBackToLiveEdge}
                    style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', gap: '6px', background: 'var(--primary-red)', color: 'white', border: 'none', fontWeight: 'bold' }}
                  >
                    🔴 Ku laabo Live-ka
                  </button>
                )}

                {/* Close Button */}
                <button 
                  type="button" 
                  className="btn-close-modal" 
                  onClick={() => setActivePlayer(null)}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem', fontWeight: 'bold', padding: '0 5px' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Split screen */}
            <div className="player-modal-body">
              {/* Left Column: Player (takes full screen if notes hidden) */}
              <div className="player-column" style={{ flex: showNotesPanel ? 7.5 : 1 }}>
                <div 
                  ref={playerWrapperRef} 
                  className="player-wrapper-container"
                  style={{ position: 'relative', width: '100%' }}
                >
                  <div
                    className={`video-aspect-wrapper${activePlayer.channel.platform === 'tiktok' && activePlayer.videoId ? ' vertical' : ''}`}
                    style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
                  >
                    {activePlayer.channel.platform === 'youtube' ? (
                      <iframe 
                        id="yt-player-iframe"
                        src={(activePlayer.videoId && activePlayer.videoId.length === 11)
                          ? `https://www.youtube.com/embed/${activePlayer.videoId}?autoplay=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
                          : `https://www.youtube.com/embed/live_stream?channel=${activePlayer.channel.identifier}&autoplay=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
                        }
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                        title="YouTube Player"
                        style={{ width: '100%', height: '100%' }}
                      ></iframe>
                    ) : activePlayer.channel.platform === 'tiktok' ? (
                      activePlayer.videoId ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                          {/* player/v1 is TikTok's real inline video player (fills 100% width/height).
                              embed/v2 renders a small preview "card" capped at 360px wide by TikTok's
                              own CSS, which is why the video looked stuck in a small box before.
                              The URL takes the raw video ID only -- no @username/video/ segments. */}
                          <iframe
                            src={`https://www.tiktok.com/player/v1/${activePlayer.videoId}?music_info=1&description=1`}
                            frameBorder="0"
                            allow={TIKTOK_IFRAME_ALLOW}
                            allowFullScreen
                            title="TikTok Player"
                            style={{ flex: 1, width: '100%', height: '100%' }}
                          ></iframe>
                          <div style={{ display: 'flex', padding: '10px', background: 'rgba(0,0,0,0.4)', gap: '10px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-action"
                              onClick={() => {
                                setActivePlayer(prev => ({ ...prev, videoId: null }));
                                setNewNoteText('');
                              }}
                              style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--card-border)' }}
                            >
                              ← Dib u Laabo
                            </button>
                            <input 
                              type="text" 
                              placeholder="Daawada muuqaal kale (Geli link-ga TikTok)..." 
                              className="input-field" 
                              style={{ flex: 1, fontSize: '0.8rem', height: '32px', padding: '0 10px', background: 'rgba(255,255,255,0.06)' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const url = e.target.value.trim();
                                  const vId = extractTikTokId(url);
                                  if (vId) {
                                    addVideoIfMissing(vId, { url });
                                    setActivePlayer(prev => ({ ...prev, videoId: vId, type: 'video' }));
                                    e.target.value = '';
                                  } else {
                                    showToast('Link-ga TikTok ma ahan mid sax ah', 'error');
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '16px', boxSizing: 'border-box', overflowY: 'auto' }}>
                          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
                              Fadlan paste-garey link-ga muuqaalka aad rabto inaad note-ka ka qaadato:
                            </p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <input 
                                type="text" 
                                placeholder="Tusaale: https://www.tiktok.com/@username/video/123456789" 
                                className="input-field" 
                                value={tiktokInputUrl}
                                onChange={(e) => setTiktokInputUrl(e.target.value)}
                                style={{ flex: 1, fontSize: '0.85rem', height: '36px', padding: '0 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--card-border)', color: 'white', borderRadius: '6px' }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const url = tiktokInputUrl.trim();
                                    const vId = extractTikTokId(url);
                                    if (vId) {
                                      addVideoIfMissing(vId, { url });
                                      setActivePlayer(prev => ({ ...prev, videoId: vId, type: 'video' }));
                                      setTiktokInputUrl('');
                                    } else {
                                      showToast('Link-ga TikTok ma ahan mid sax ah', 'error');
                                    }
                                  }
                                }}
                              />
                              <button 
                                className="btn btn-primary"
                                style={{ height: '36px', padding: '0 16px', fontSize: '0.85rem' }}
                                onClick={() => {
                                  const url = tiktokInputUrl.trim();
                                  const vId = extractTikTokId(url);
                                  if (vId) {
                                    addVideoIfMissing(vId, { url });
                                    setActivePlayer(prev => ({ ...prev, videoId: vId, type: 'video' }));
                                    setTiktokInputUrl('');
                                  } else {
                                    showToast('Link-ga TikTok ma ahan mid sax ah', 'error');
                                  }
                                }}
                              >
                                Daawo Hadda
                              </button>
                            </div>
                          </div>

                          {/* Latest videos grid fetched by the backend (TikTok's own creator
                              embed widget is unreliable: it stays 1px tall when its resize
                              handshake fails, so we render our own list instead). */}
                          <div style={{ flex: 1, minHeight: '400px', width: '100%' }}>
                            {isLoadingVideos ? (
                              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
                                Soo raraya muuqaalada TikTok...
                              </p>
                            ) : channelVideos.length > 0 ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                                {channelVideos.map(video => (
                                  <div
                                    key={video.id}
                                    onClick={() => setActivePlayer(prev => ({ ...prev, videoId: video.id, type: 'video' }))}
                                    style={{ cursor: 'pointer', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)' }}
                                  >
                                    {video.thumbnail && (
                                      <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', display: 'block' }}
                                      />
                                    )}
                                    <p style={{ margin: 0, padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-white)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                      {video.title}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              /* Fallback: frame TikTok's server-rendered creator page directly */
                              <iframe
                                src={`https://www.tiktok.com/embed/@${activePlayer.channel.identifier}?lang=en-US`}
                                frameBorder="0"
                                allow={TIKTOK_IFRAME_ALLOW}
                                title="TikTok Creator"
                                style={{ width: '100%', height: '100%', minHeight: '480px', border: 0, borderRadius: '12px' }}
                              ></iframe>
                            )}
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>

                  {/* Floating Note Input Overlay (Only for recorded videos and when position is overlay) */}
                  {noteInputPosition === 'overlay' && activePlayer.type === 'video' && (
                    <form 
                      onSubmit={handleAddNote} 
                      className="note-input-overlay"
                      style={{
                        position: 'absolute',
                        left: `${overlayPos.x}px`,
                        top: `${overlayPos.y}px`,
                        margin: 0
                      }}
                    >
                      <div 
                        className="drag-handle" 
                        onMouseDown={handleDragMouseDown}
                        onTouchStart={handleDragTouchStart}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'move', width: '20px', height: '36px', color: 'rgba(255,255,255,0.4)', userSelect: 'none' }}
                      >
                        <GripVertical size={16} />
                      </div>
                      <textarea 
                        className="input-field overlay-textarea" 
                        placeholder="Qor note..."
                        value={newNoteText}
                        onChange={(e) => {
                          setNewNoteText(e.target.value);
                          e.target.style.height = '36px';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        style={{ 
                          margin: 0, 
                          flex: 1, 
                          height: '36px', 
                          minHeight: '36px', 
                          padding: '8px 12px', 
                          fontSize: '0.8rem', 
                          background: 'rgba(255,255,255,0.08)',
                          resize: 'none',
                          lineHeight: '1.4',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          outline: 'none',
                          overflow: 'hidden'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddNote(e);
                          }
                        }}
                        required
                      />
                      <button type="submit" className="btn btn-primary" style={{ padding: '0 12px', height: '36px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus size={14} />
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Right Column: Sidebar (Notes & Playlist) */}
              {showNotesPanel && (
                <div className="notes-column">
                  {/* Sidebar Tabs */}
                  {activePlayer.channel.platform === 'youtube' && (
                    <div className="tabs" style={{ display: 'flex', width: '100%', marginBottom: '16px', background: 'rgba(255,255,255,0.02)' }}>
                      <button 
                        type="button"
                        className={`tab-btn ${activeTabInModal === 'notes' ? 'active' : ''}`}
                        onClick={() => setActiveTabInModal('notes')}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 10px', fontSize: '0.8rem' }}
                      >
                        Qoraalada
                      </button>
                      <button 
                        type="button"
                        className={`tab-btn ${activeTabInModal === 'playlist' ? 'active' : ''}`}
                        onClick={() => setActiveTabInModal('playlist')}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 10px', fontSize: '0.8rem' }}
                      >
                        Muuqaalada
                      </button>
                    </div>
                  )}

                  {activeTabInModal === 'notes' || activePlayer.channel.platform !== 'youtube' ? (
                    <>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', color: 'var(--text-white)' }}>
                        Qoraalada Muuqaalka (Notes)
                      </h4>

                      {/* Notes List */}
                      <div className="notes-list-container">
                        {notes.length === 0 ? (
                          <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                            Weli wax qoraal ah lagama qorin muuqaalkan.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {notes.map((note) => (
                              <div key={note.id} className="note-item" style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '10px',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--card-border)',
                                borderRadius: '8px',
                                padding: '8px 10px'
                              }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                                  {activePlayer.videoId && activePlayer.channel.platform === 'youtube' ? (
                                    <button
                                      type="button"
                                      className="note-timestamp-btn"
                                      onClick={() => seekPlayerTo(note.timestamp_seconds)}
                                      style={{
                                        background: 'rgba(255, 59, 48, 0.1)',
                                        color: 'var(--primary-red)',
                                        border: '1px solid rgba(255, 59, 48, 0.2)',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        fontFamily: 'monospace'
                                      }}
                                    >
                                      {formatTimestamp(note.timestamp_seconds)}
                                    </button>
                                  ) : activePlayer.videoId ? (
                                    <span style={{
                                      background: 'rgba(255,255,255,0.06)',
                                      color: 'var(--text-muted)',
                                      border: '1px solid var(--card-border)',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      fontFamily: 'monospace'
                                    }}>
                                      NOTE
                                    </span>
                                  ) : (
                                    <span style={{
                                      background: 'rgba(52, 199, 89, 0.1)',
                                      color: 'var(--secondary-green)',
                                      border: '1px solid rgba(52, 199, 89, 0.2)',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}>
                                      LIVE
                                    </span>
                                  )}
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-white)', wordBreak: 'break-word', flex: 1, lineHeight: '1.4' }}>
                                    {note.note_text}
                                  </p>
                                </div>
                                <button 
                                  type="button" 
                                  onClick={() => handleDeleteNote(note.id)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-dimmed)', cursor: 'pointer', padding: '2px' }}
                                  title="Tirtir note-ka"
                                >
                                  <Trash2 size={12} style={{ color: 'var(--primary-red)' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Note Form (Only if position is Sidebar) */}
                      {noteInputPosition === 'sidebar' && (
                        <form onSubmit={handleAddNote} style={{ marginTop: 'auto', borderTop: '1px solid var(--card-border)', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <textarea 
                              className="input-field sidebar-textarea" 
                              placeholder="Qor note..."
                              value={newNoteText}
                              onChange={(e) => {
                                setNewNoteText(e.target.value);
                                e.target.style.height = '40px';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              style={{ 
                                margin: 0, 
                                flex: 1, 
                                height: '40px', 
                                minHeight: '40px',
                                fontSize: '0.9rem',
                                resize: 'none',
                                lineHeight: '1.4',
                                padding: '8px 12px',
                                background: 'rgba(255,255,255,0.08)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                outline: 'none',
                                overflow: 'hidden'
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAddNote(e);
                                }
                              }}
                              required
                            />
                            <button type="submit" className="btn btn-primary" style={{ padding: '0 12px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Plus size={16} />
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  ) : (
                    <>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', color: 'var(--text-white)' }}>
                        Muuqaalada dhowaan la soo dhigay (Playlist)
                      </h4>

                      {/* Video Playlist */}
                      <div className="notes-list-container">
                        {isLoadingVideos ? (
                          <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                            Soo dejinaya liiska...
                          </div>
                        ) : channelVideos.length === 0 ? (
                          <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                            Muuqaalo lama helin.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {channelVideos.map((video) => (
                              <div 
                                key={video.id} 
                                className="playlist-video-item"
                                onClick={() => {
                                  // Switch player source
                                  setActivePlayer(prev => ({
                                    ...prev,
                                    type: 'video',
                                    videoId: video.id
                                  }));
                                }}
                                style={{
                                  display: 'flex',
                                  gap: '10px',
                                  background: activePlayer.videoId === video.id ? 'rgba(255, 59, 48, 0.08)' : 'rgba(255,255,255,0.01)',
                                  border: activePlayer.videoId === video.id ? '1px solid rgba(255, 59, 48, 0.3)' : '1px solid var(--card-border)',
                                  borderRadius: '8px',
                                  padding: '8px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {video.thumbnail ? (
                                  <img 
                                    src={video.thumbnail} 
                                    alt={video.title} 
                                    style={{ width: '80px', height: '45px', borderRadius: '4px', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      const fallback = e.target.parentNode.querySelector('.video-thumb-fallback');
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="video-thumb-fallback"
                                  style={{ 
                                    width: '80px', 
                                    height: '45px', 
                                    borderRadius: '4px', 
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', 
                                    border: '1px solid var(--card-border)',
                                    display: video.thumbnail ? 'none' : 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                    fontWeight: 'bold',
                                    fontSize: '0.65rem'
                                  }}
                                >
                                  {activePlayer.channel.platform === 'tiktok' ? 'TIKTOK' : 'VIDEO'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: activePlayer.videoId === video.id ? 'white' : 'var(--text-white)',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    lineHeight: '1.2'
                                  }}>
                                    {video.title}
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {video.published ? new Date(video.published).toLocaleDateString() : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
