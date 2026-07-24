import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Bell, BellOff, Settings, Users, Video, Plus, Trash2,
  Mail, Shield, RefreshCw, AlertCircle, Youtube, CheckCircle2, Play,
  Eye, EyeOff, ListVideo, GripVertical, Maximize, Minimize,
  Sun, Moon, LogOut, User, ChevronDown, Music2, Volume2, VolumeX,
  FileText
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
let cachedSupabase = typeof window !== 'undefined' ? (window.__supabaseClient || null) : null;

// Backend API base URL: set VITE_API_URL in production (e.g. Vercel env vars)
// to point at the deployed backend; falls back to localhost for local dev.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// UI translations (Somali default, English secondary). Covers the app shell,
// auth screens, dashboard, add-channel flow, profile, and toast messages.
// The Settings tab's SMTP/Google-Apps-Script setup guide and the video
// player/notes modal remain Somali-only for now.
const translations = {
  appTagline: { so: 'La soco marka dadka aad rabto ay Live galaan ama muuqaal cusub soo dhigaan.', en: 'Get notified the moment people you follow go live or post a new video.' },
  emailLabel: { so: 'Email-ka', en: 'Email' },
  passwordLabel: { so: 'Password-ka', en: 'Password' },
  forgotPassword: { so: 'Ma illowday password-ka?', en: 'Forgot password?' },
  loginBtn: { so: 'Soo Gal', en: 'Log In' },
  signupBtn: { so: 'Abuur Akoonka', en: 'Create Account' },
  sendResetLink: { so: 'Dir Link Dib-u-dejin', en: 'Send Reset Link' },
  pleaseWait: { so: 'Fadlan sug...', en: 'Please wait...' },
  noAccount: { so: 'Miyaanad lahayn akoon?', en: "Don't have an account?" },
  signUpHere: { so: 'Halkan ka abuur (Sign Up)', en: 'Sign up here' },
  haveAccount: { so: 'Horey ma u lahayd akoon?', en: 'Already have an account?' },
  loginHere: { so: 'Halkan ka soo gal (Log In)', en: 'Log in here' },
  backToLogin: { so: '← Ku noqo Login-ka', en: '← Back to Login' },
  orDivider: { so: 'AMA', en: 'OR' },
  googleSignIn: { so: 'Geli Akoonka Google (Sign In)', en: 'Sign in with Google' },
  googleNote: { so: '* Xusuusin: Google Sign-in wuxuu u baahan yahay in laga shido Supabase Dashboard-kaaga.', en: '* Note: Google Sign-in must be enabled in your Supabase Dashboard.' },
  resetPasswordTitle: { so: 'Beddel Password-ka', en: 'Reset Password' },
  resetPasswordSubtitle: { so: 'Geli password-kaaga cusub.', en: 'Enter your new password.' },
  newPasswordLabel: { so: 'Password Cusub', en: 'New Password' },
  savePassword: { so: 'Kaydi Password-ka Cusub', en: 'Save New Password' },

  appSubtitle: { so: 'La soco marka qof aad rabto uu Live galo ama muuqaal cusub soo dhigo YouTube & TikTok', en: 'Track when someone you follow goes live or uploads on YouTube & TikTok' },
  checkNow: { so: 'Hubi Hadda', en: 'Check Now' },
  soundLabel: { so: 'Dhawaaq', en: 'Sound' },
  pushAlert: { so: 'Push Alert', en: 'Push Alert' },
  loggedInAs: { so: 'Wuxuu u furan yahay:', en: 'Signed in as:' },
  logOut: { so: 'Ka Bax (Log Out)', en: 'Log Out' },

  tabDashboard: { so: 'Dashboard', en: 'Dashboard' },
  tabAddChannel: { so: 'Ku dar Kanaal', en: 'Add Channel' },
  tabSettings: { so: 'Settings', en: 'Settings' },

  noChannelsTitle: { so: 'Weli ma jiraan kanaalo aad la socoto', en: 'No channels being tracked yet' },
  noChannelsSub: { so: 'Guji "Ku dar Kanaal" si aad u bilowdo', en: 'Click "Add Channel" to get started' },
  lastChecked: { so: 'Check-gii Ugu Dambeeyay', en: 'Last Checked' },
  neverChecked: { so: 'Weli lama hubin', en: 'Not checked yet' },
  lastVideo: { so: 'Muuqaalkii Ugu Dambeeyay', en: 'Latest Video' },
  viewVideo: { so: 'Booqo Muuqaalka', en: 'View Video' },
  watchLive: { so: 'Daawo Live-ka', en: 'Watch Live' },
  watchVideos: { so: 'Daawo Muuqaalada', en: 'Watch Videos' },
  deleteBtn: { so: 'Tirtir', en: 'Delete' },
  statusLive: { so: 'LIVE', en: 'LIVE' },
  statusOffline: { so: 'OFFLINE', en: 'OFFLINE' },

  addChannelTitle: { so: 'Ku dar Kanaal Cusub', en: 'Add New Channel' },
  addByUrl: { so: 'Ku dar Link (URL)', en: 'Add by Link (URL)' },
  addManual: { so: 'Ku dar Gacanta (Manual)', en: 'Add Manually' },
  channelUrlLabel: { so: 'Geli Link-ga Kanaalka (Channel URL)', en: 'Enter Channel URL' },
  checkingLink: { so: 'Hubinaya...', en: 'Checking...' },
  checkLink: { so: 'Hubi Link-ga', en: 'Check Link' },
  urlSupportNote: { so: '* Waxaa la taageerayaa link-yada YouTube-ka (Channel ama Handle) iyo TikTok profiles.', en: '* YouTube channel/handle links and TikTok profiles are supported.' },
  adding: { so: 'Lagu darayaa...', en: 'Adding...' },
  addChannelBtn: { so: 'Ku Dar Kanaalka', en: 'Add Channel' },
  platformLabel: { so: 'Bar-bulsho (Platform)', en: 'Platform' },
  identifierLabel: { so: 'Identifer (YouTube Channel ID / TikTok Username)', en: 'Identifier (YouTube Channel ID / TikTok Username)' },
  youtubeIdNote: { so: "* Fiiro gaar ah: YouTube u isticmaal Channel ID-ga rasmiga ah (ka bilaabma UC...) ee ha isticmaalin handle-ka (@name).", en: "* Note: Use YouTube's official Channel ID (starts with UC...), not the @handle." },
  displayNameLabel: { so: 'Magaca Qofka (Display Name)', en: 'Display Name' },
  displayNamePlaceholder: { so: 'Geli magaca aad u bixinayso', en: 'Enter a name for this channel' },
  addBtn: { so: 'Ku Dar', en: 'Add' },

  profileTitle: { so: 'Profile', en: 'Profile' },
  themeLabel: { so: 'Mowduuca', en: 'Theme' },
  darkMode: { so: 'Mugdi', en: 'Dark' },
  lightMode: { so: 'Iftiin', en: 'Light' },
  languageLabel: { so: 'Luqadda', en: 'Language' },
  fullSettings: { so: 'Settings-ka Buuxa', en: 'Full Settings' },

  toastFetchChannelsFail: { so: 'Fashil: Ka soo kicinta kanaalada', en: 'Failed to load channels' },
  toastNoNotifSupport: { so: 'Cabsida: Browser-kaan ma taageero notifications', en: 'Sorry: this browser does not support notifications' },
  toastNotifEnabled: { so: 'Ogeysiisyada browser-ka waa la shiday!', en: 'Browser notifications enabled!' },
  toastNotifDenied: { so: 'Ogeysiisyada waa la diiday.', en: 'Notifications were denied.' },
  toastFillEmailPassword: { so: 'Fadlan geli email-ka iyo password-ka', en: 'Please enter your email and password' },
  toastLoginSuccess: { so: 'Waa laguugu guuleystay soo galidda!', en: 'Logged in successfully!' },
  toastSignupSuccess: { so: 'Waa laguugu guuleystay is-diiwaan-gelinta! Fadlan hubi email-kaaga.', en: 'Signed up successfully! Please check your email.' },
  toastEnterEmail: { so: 'Fadlan geli email-kaaga', en: 'Please enter your email' },
  toastResetLinkSent: { so: 'Link dib-u-dejinta password-ka ayaa loo diray email-kaaga!', en: 'A password reset link has been sent to your email!' },
  toastPasswordTooShort: { so: 'Password-ku waa inuu ka koobnaadaa ugu yaraan 6 xaraf', en: 'Password must be at least 6 characters' },
  toastPasswordChanged: { so: 'Password-kaaga waa la beddelay!', en: 'Your password has been changed!' },
  toastLoggedOut: { so: 'Waa laguu saaray akoonka (Logged Out).', en: 'You have been logged out.' },
  toastEnterChannelUrl: { so: 'Fadlan geli link-ga kanaalka (URL)', en: 'Please enter the channel URL' },
  toastDataFound: { so: 'Xogta waa la soo helay!', en: 'Data found!' },
  toastCouldNotFetchData: { so: 'Ma awoodo inaan soo qabto xogta', en: 'Could not fetch the data' },
  toastServerDown: { so: 'Server-ka (Port 5001) ma shaqaynayo', en: 'The server (Port 5001) is not responding' },
  toastCheckUrlFirst: { so: 'Fadlan marka hore hubi oo soo qabo xogta', en: 'Please check the link first to fetch the data' },
  toastFillAllFields: { so: 'Fadlan buuxi dhammaan meelaha banaan', en: 'Please fill in all fields' },
  toastChannelAdded: { so: 'Kanaalka waa la daray. Hubinta heerka ayaa bilaabatay...', en: 'Channel added. Checking its status now...' },
  toastAddChannelFail: { so: 'Fashil intii lagu jiray ku darista kanaalka', en: 'Failed to add the channel' },
  toastChannelDeleted: { so: 'Kanaalka waa la tirtiray.', en: 'Channel deleted.' },
  toastDeleteChannelFail: { so: 'Fashil: Tirtirista kanaalka', en: 'Failed to delete the channel' },
  toastNoteSaved: { so: 'Qoraalkii note-ka waa la kaydiyay!', en: 'Note saved!' },
  toastNoteSaveFail: { so: 'Cillad intii lagu jiray kaydinta note-ka', en: 'Failed to save the note' },
  toastNoteDeleted: { so: 'Note-kii waa la tirtiray.', en: 'Note deleted.' },
  toastNoteDeleteFail: { so: 'Cillad intii lagu jiray tirtirista note-ka', en: 'Failed to delete the note' },
  toastBackToLiveEdge: { so: 'Waxaad ku laabatay halka live-ku hadda marayo!', en: "You're back at the live edge!" },
  toastPlayerNotReady: { so: 'Player-ku weli ma diyaarsana ama ma taageerayo live seek-ga', en: 'The player is not ready yet or does not support live seeking' },
  toastSettingsSaved: { so: 'Settings-ka waa la kaydiyay!', en: 'Settings saved!' },
  toastSettingsSaveFail: { so: 'Fashil: Kaydinta settings-ka', en: 'Failed to save settings' },
  toastCheckStarted: { so: 'Hubinta hadda waa la bilaabay!', en: 'Check started!' },
  toastServerUnreachable: { so: 'Ma awoodo inaan la xiriiro Server-ka (Port 5001)', en: 'Could not reach the server (Port 5001)' },
  toastTestEmailSent: { so: 'Email tijaabo ah ayaa laguu soo diray!', en: 'A test email has been sent to you!' },
  toastInvalidTikTokLink: { so: 'Link-ga TikTok ma ahan mid sax ah', en: 'That TikTok link is not valid' },
  toastErrorPrefix: { so: 'Cillad', en: 'Error' },
  toastLiveNow: { so: 'hadda waa LIVE!', en: 'is now LIVE!' },
  noVideoYet: { so: 'Weli lama helin', en: 'None yet' },
  welcomeBack: { so: 'Soo dhawoow', en: 'Welcome back' },
  welcomeSubtitle: { so: 'Waa kan cusbooneysiinta ugu dambeysay ee kanaaladaada', en: "Here's the latest update from your channels" },
  freePlan: { so: 'Qorshaha Bilaashka', en: 'Free Plan' },
  backBtn: { so: '← Dib', en: '← Back' },
  noteInputLabel: { so: 'Note Input:', en: 'Note Input:' },
  noteInputSidebar: { so: 'Sidebar (Dhinaca)', en: 'Sidebar' },
  noteInputOverlay: { so: 'Overlay (Dul-sabeeya)', en: 'Overlay' },
  hideSidebar: { so: 'Qari Sidebar', en: 'Hide Sidebar' },
  showSidebar: { so: 'Muuji Sidebar', en: 'Show Sidebar' },
  exitFullscreen: { so: 'Exit Fullscreen', en: 'Exit Fullscreen' },
  enterFullscreen: { so: 'Fullscreen', en: 'Fullscreen' },
  goBackToLive: { so: '🔴 Ku laabo Live-ka', en: '🔴 Go back to Live' },
  watchTabNotes: { so: 'Qoraalada', en: 'Notes' },
  watchTabPlaylist: { so: 'Muuqaalada', en: 'Videos' },
  notesTitle: { so: 'Qoraalada Muuqaalka (Notes)', en: 'Video Notes' },
  emptyNotes: { so: 'Weli wax qoraal ah lagama qorin muuqaalkan.', en: 'No notes written for this video yet.' },
  deleteNoteTooltip: { so: 'Tirtir note-ka', en: 'Delete note' },
  writeNotePlaceholder: { so: 'Qor note...', en: 'Write a note...' },
  playlistTitle: { so: 'Muuqaalada dhowaan la soo dhigay (Playlist)', en: 'Recently uploaded videos (Playlist)' },
  loadingPlaylist: { so: 'Soo dejinaya liiska...', en: 'Loading playlist...' },
  noVideosFound: { so: 'Muuqaalo lama helin.', en: 'No videos found.' },
  pasteTiktokPlaceholder: { so: 'Tusaale: https://www.tiktok.com/@username/video/123456789', en: 'Example: https://www.tiktok.com/@username/video/123456789' },
  tiktokLinkPrompt: { so: 'Fadlan paste-garey link-ga muuqaalka aad rabto inaad note-ka ka qaadato:', en: 'Please paste the link of the video you want to take notes on:' },
  tiktokLinkFieldPlaceholder: { so: 'Daawada muuqaal kale (Geli link-ga TikTok)...', en: 'Watch another video (Enter TikTok link)...' },
  watchNowBtn: { so: 'Daawo Hadda', en: 'Watch Now' },
  loadingTiktok: { so: 'Soo raraya muuqaalada TikTok...', en: 'Loading TikTok videos...' },
  fallbackTiktokText: { so: 'Soo dejinaya liiska...', en: 'Loading playlist...' },
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [supabase, setSupabase] = useState(null);
  const [channels, setChannels] = useState([
    { id: '1', platform: 'youtube', identifier: 'UC7xpeYGGwMo_h3rXmRLfZyg', name: 'Ninjagaming', is_live: false, last_checked: new Date().toISOString(), last_video_url: 'https://youtube.com/watch?v=abc', avatar_url: null },
    { id: '2', platform: 'youtube', identifier: 'UCL0u5uz7KZ9q-pe-VC8TY-w', name: 'Candace Owens', is_live: false, last_checked: new Date().toISOString(), last_video_url: 'https://youtube.com/watch?v=abc', avatar_url: null },
    { id: '3', platform: 'tiktok', identifier: 'teammk3021', name: 'MrKHAN x DADDY302', is_live: false, last_checked: new Date().toISOString(), last_video_url: null, avatar_url: null },
  ]);
  const [isEmailConfigured, setIsEmailConfigured] = useState(false);
  
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
  const [theme, setTheme] = useState(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr) return attr;
    }
    return 'dark';
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('veonotes-lang') || 'en';
    } catch (e) {
      return 'en';
    }
  });
  const t = (key) => (translations[key] ? (translations[key][language] || translations[key].so) : key);

  // Track previous live states to trigger notifications on transition
  const prevLiveStatesRef = useRef({});

  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login', 'signup', or 'forgot'
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newRecoveryPassword, setNewRecoveryPassword] = useState('');

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

  const prevActivePlayerRef = useRef(null);
  const activeChannelIdRef = useRef(null);

  useEffect(() => {
    activeChannelIdRef.current = activePlayer?.channel?.id || null;
    if (activePlayer && !prevActivePlayerRef.current) {
      if (activePlayer.type === 'video' && activePlayer.channel.platform === 'youtube') {
        setActiveTabInModal('playlist');
      } else {
        setActiveTabInModal('notes');
      }
    }
    prevActivePlayerRef.current = activePlayer;
  }, [activePlayer]);

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

    const initBaseline = () => {
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
    };

    // Delay the baseline capture so an in-flight seekTo (e.g. from
    // goBackToLiveEdge, triggered the instant isTrackingLive flips true) has
    // time to land first. Baselining immediately would capture the stale
    // pre-seek time, making the next tick misread the seek's own jump as a
    // manual seek and disengage tracking right away.
    const initTimer = setTimeout(initBaseline, 800);

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

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [activePlayer, isTrackingLive]);

  // Initialize Supabase Client dynamically from backend config and check email config
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
            if (typeof window !== 'undefined') {
              window.__supabaseClient = cachedSupabase;
            }
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

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        const data = await res.json();
        if (data.status === 'ok') {
          setIsEmailConfigured(!!data.emailConfigured);
        }
      } catch (err) {
        console.error("Failed to fetch backend health status:", err);
      }
    };

    loadConfig();
    checkHealth();
  }, [activeTab]);

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
      if (_event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      // Strip token details from URL hash if they exist
      if (session && window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))) {
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Load channels when session is active
  useEffect(() => {
    if (!supabase || !session) return;
    
    fetchChannels();

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
              showToast(`${updatedChannel.name} ${t('toastLiveNow')}`);
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

  // Apply theme choice to the document and persist it
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('veonotes-theme', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    try {
      localStorage.setItem('veonotes-lang', lang);
    } catch (e) {}
  };

  // Close the profile dropdown when clicking outside of it
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

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
      showToast(t('toastFetchChannelsFail'), 'error');
    }
  };

  // Settings loading removed as email alerts are configured in backend environment

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      showToast(t('toastNoNotifSupport'), 'error');
      return;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      showToast(t('toastNotifEnabled'));
      new Notification("Veonotes", {
        body: "Ogeysiisyada waa lagu guuleystay!"
      });
    } else {
      setNotificationsEnabled(false);
      showToast(t('toastNotifDenied'), 'error');
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      showToast(t('toastServerUnreachable'), 'error');
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err) {
      showToast(`${t('toastErrorPrefix')}: ${err.message}`, 'error');
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!supabase) {
      showToast(t('toastServerUnreachable'), 'error');
      return;
    }
    if (!email || !password) {
      showToast(t('toastFillEmailPassword'), 'error');
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
        showToast(t('toastLoginSuccess'));
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
        showToast(t('toastSignupSuccess'));
      }
    } catch (err) {
      showToast(`${t('toastErrorPrefix')}: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!supabase) {
      showToast(t('toastServerUnreachable'), 'error');
      return;
    }
    if (!email) {
      showToast(t('toastEnterEmail'), 'error');
      return;
    }
    setIsSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      showToast(t('toastResetLinkSent'));
      setAuthMode('login');
    } catch (err) {
      showToast(`${t('toastErrorPrefix')}: ${err.message}`, 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleUpdateRecoveryPassword = async (e) => {
    e.preventDefault();
    if (!supabase) {
      showToast(t('toastServerUnreachable'), 'error');
      return;
    }
    if (!newRecoveryPassword || newRecoveryPassword.length < 6) {
      showToast(t('toastPasswordTooShort'), 'error');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newRecoveryPassword });
      if (error) throw error;
      showToast(t('toastPasswordChanged'));
      setIsRecoveryMode(false);
      setNewRecoveryPassword('');
      window.history.replaceState(null, null, window.location.pathname + window.location.search);
    } catch (err) {
      showToast(`${t('toastErrorPrefix')}: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      showToast(t('toastServerUnreachable'), 'error');
      return;
    }
    await supabase.auth.signOut();
    showToast(t('toastLoggedOut'));
  };

  const handleResolveUrl = async (e) => {
    e.preventDefault();
    if (!channelUrl) {
      showToast(t('toastEnterChannelUrl'), 'error');
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
        showToast(t('toastDataFound'));
      } else {
        showToast(`${t('toastErrorPrefix')}: ${data.error || t('toastCouldNotFetchData')}`, 'error');
      }
    } catch (err) {
      showToast(t('toastServerDown'), 'error');
    } finally {
      setIsResolving(false);
    }
  };

  const handleAddChannel = async (e) => {
    if (e) e.preventDefault();
    
    let platform, identifier, name, avatarUrl = null;
    
    if (addMode === 'url') {
      if (!resolvedChannel) {
        showToast(t('toastCheckUrlFirst'), 'error');
        return;
      }
      platform = resolvedChannel.platform;
      identifier = resolvedChannel.identifier;
      name = resolvedChannel.name;
      avatarUrl = resolvedChannel.avatar;
    } else {
      if (!newChannel.identifier || !newChannel.name) {
        showToast(t('toastFillAllFields'), 'error');
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
      
      showToast(t('toastChannelAdded'));
      setNewChannel({ platform: 'youtube', identifier: '', name: '' });
      setChannelUrl('');
      setResolvedChannel(null);
      fetchChannels();
      
      // Trigger status check immediately in the backend to resolve initial status
      fetch(`${API_URL}/api/check`, { method: 'POST' })
        .then(() => fetchChannels())
        .catch(err => console.error("Failed to trigger auto check:", err));
    } catch (err) {
      showToast(t('toastAddChannelFail'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChannel = async (id) => {
    try {
      const { error } = await supabase.from('channels').delete().eq('id', id);
      if (error) throw error;
      showToast(t('toastChannelDeleted'));
      fetchChannels();
    } catch (err) {
      showToast(t('toastDeleteChannelFail'), 'error');
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
      showToast(t('toastNoteSaved'));
    } catch (err) {
      showToast(t('toastNoteSaveFail'), 'error');
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
      showToast(t('toastNoteDeleted'));
    } catch (err) {
      showToast(t('toastNoteDeleteFail'), 'error');
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
        showToast(t('toastBackToLiveEdge'));
      } catch (err) {
        console.error("Failed to seek to live edge:", err);
      }
    } else {
      showToast(t('toastPlayerNotReady'), 'warning');
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
        // Guard against race conditions
        if (activeChannelIdRef.current !== channelId) return;

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
      if (activeChannelIdRef.current === channelId) {
        setIsLoadingVideos(false);
      }
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

  const triggerManualCheck = async () => {
    setIsLoading(true);
    try {
      // Connect to the local backend port 5001
      const res = await fetch(`${API_URL}/api/check`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showToast(t('toastCheckStarted'));
      fetchChannels();
    } catch (err) {
      showToast(t('toastServerUnreachable'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestEmail = async () => {
    if (!session?.user?.email) {
      showToast(t('toastEnterEmail'), 'error');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/send-test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          to_email: session.user.email
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(t('toastTestEmailSent'));
      } else {
        showToast(`${t('toastErrorPrefix')}: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(t('toastServerDown'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const authLangSwitcher = (
    <div className="lang-switch" style={{ position: 'absolute', top: '20px', right: '20px' }}>
      <button type="button" className={language === 'so' ? 'active' : ''} onClick={() => changeLanguage('so')}>SO</button>
      <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>EN</button>
    </div>
  );

  if (isRecoveryMode) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', position: 'relative' }}>
        {authLangSwitcher}
        {toast && (
          <div className={`toast ${toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
            {toast.type === 'error' ? <AlertCircle color="#ff3b30" /> : <CheckCircle2 color="#5E17F5" />}
            <span>{toast.message}</span>
          </div>
        )}
        <div className="glass-card" style={{ maxWidth: '420px', width: '100%', padding: '40px 30px' }}>
          <div className="text-center" style={{ marginBottom: '30px' }}>
            <Shield className="mx-auto mb-4" color="#5E17F5" size={56} style={{ margin: '0 auto 15px auto' }} />
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '10px' }}>{t('resetPasswordTitle')}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {t('resetPasswordSubtitle')}
            </p>
          </div>
          <form onSubmit={handleUpdateRecoveryPassword}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>{t('newPasswordLabel')}</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={newRecoveryPassword}
                onChange={(e) => setNewRecoveryPassword(e.target.value)}
                required
                minLength={6}
                style={{ marginBottom: '4px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={isLoading} style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {isLoading ? t('pleaseWait') : t('savePassword')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', position: 'relative' }}>
        {authLangSwitcher}
        {/* Toast Notification */}
        {toast && (
          <div className={`toast ${toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
            {toast.type === 'error' ? <AlertCircle color="#ff3b30" /> : <CheckCircle2 color="#5E17F5" />}
            <span>{toast.message}</span>
          </div>
        )}

        <div className="glass-card" style={{ maxWidth: '420px', width: '100%', padding: '40px 30px' }}>
          <div className="text-center" style={{ marginBottom: '30px' }}>
            <img src="/veonotes-icon-256.png" alt="Veonotes" style={{ width: '72px', height: '72px', margin: '0 auto 15px auto', display: 'block' }} />
            <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '10px' }}>Veonotes</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {t('appTagline')}
            </p>
          </div>

          <form onSubmit={authMode === 'forgot' ? handleForgotPassword : handleEmailAuth} style={{ marginBottom: '24px' }}>
            <div className="form-group" style={{ marginBottom: authMode === 'forgot' ? '20px' : '16px' }}>
              <label>{t('emailLabel')}</label>
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
            {authMode !== 'forgot' && (
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>{t('passwordLabel')}</label>
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
            )}

            {authMode === 'login' && (
              <div className="text-right" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
                <button type="button" onClick={() => setAuthMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                  {t('forgotPassword')}
                </button>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={isLoading || isSendingReset} style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {authMode === 'forgot'
                ? (isSendingReset ? t('pleaseWait') : t('sendResetLink'))
                : (isLoading ? t('pleaseWait') : authMode === 'login' ? t('loginBtn') : t('signupBtn'))}
            </button>
          </form>

          <div className="text-center" style={{ marginBottom: '24px', fontSize: '0.85rem' }}>
            {authMode === 'login' && (
              <p style={{ color: 'var(--text-muted)' }}>
                {t('noAccount')}{' '}
                <button type="button" onClick={() => setAuthMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  {t('signUpHere')}
                </button>
              </p>
            )}
            {authMode === 'signup' && (
              <p style={{ color: 'var(--text-muted)' }}>
                {t('haveAccount')}{' '}
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  {t('loginHere')}
                </button>
              </p>
            )}
            {authMode === 'forgot' && (
              <p style={{ color: 'var(--text-muted)' }}>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                  {t('backToLogin')}
                </button>
              </p>
            )}
          </div>

          {authMode !== 'forgot' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-dimmed)', fontSize: '0.8rem' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--card-border)' }}></div>
                <span style={{ padding: '0 10px' }}>{t('orDivider')}</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--card-border)' }}></div>
              </div>

              <button type="button" className="btn btn-action w-full flex items-center justify-center gap-3 py-3" onClick={handleGoogleLogin} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px', borderRadius: '8px', fontSize: '1rem', border: '1px solid var(--card-border)' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M12.24 10.285V14.4h6.887C18.2 16.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.706 0 3.257.618 4.47 1.637l3.202-3.202C17.996 1.054 15.26 0 12.24 0 5.58 0 0 5.58 0 12.24s5.58 12.24 12.24 12.24c6.76 0 11.76-4.76 11.76-11.76 0-.796-.08-1.571-.22-2.315h-11.54z"/>
                </svg>
                {t('googleSignIn')}
              </button>
              <p className="text-center" style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '12px', lineHeight: '1.4' }}>
                {t('googleNote')}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const emailPrefix = session.user.email ? session.user.email.split('@')[0] : 'User';
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/veonotes-icon-256.png" alt="Veonotes" />
          <span>Veonotes</span>
        </div>
        <p className="sidebar-tagline">{t('appSubtitle')}</p>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Users size={18} />
            {t('tabDashboard')}
          </button>
          <button
            className={`sidebar-nav-item ${activeTab === 'manager' ? 'active' : ''}`}
            onClick={() => setActiveTab('manager')}
          >
            <Plus size={18} />
            {t('tabAddChannel')}
          </button>
          <button
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            {t('tabSettings')}
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-profile">
          <div className="profile-avatar">{session.user.email ? session.user.email.charAt(0).toUpperCase() : <User size={16} />}</div>
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">{displayName}</div>
            <div className="sidebar-profile-plan">{t('freePlan')}</div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="main-area">
        {/* Toast Notification */}
        {toast && (
          <div className={`toast ${toast.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
            {toast.type === 'error' ? <AlertCircle color="#ff3b30" /> : <CheckCircle2 color="#5E17F5" />}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Topbar */}
        <header className="header">
          <div className="header-title-section">
            <h1 style={{ fontSize: '1.7rem' }}>👋 {t('welcomeBack')}, {displayName}</h1>
            <p>{t('welcomeSubtitle')}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ padding: '10px 18px', fontSize: '0.9rem' }} onClick={triggerManualCheck} disabled={isLoading || !isConfigured}>
              <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} style={{ marginRight: '6px' }} />
              {t('checkNow')}
            </button>

            <button
              className="theme-toggle"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={`${t('soundLabel')}: ${soundEnabled ? 'ON' : 'OFF'}`}
            >
              {soundEnabled ? <Volume2 size={18} color="#34c759" /> : <VolumeX size={18} color="#8e8e93" />}
            </button>

            <button
              className="theme-toggle"
              onClick={requestNotificationPermission}
              title={t('pushAlert')}
            >
              {notificationsEnabled ? <Bell size={18} color="#34c759" /> : <BellOff size={18} color="#8e8e93" />}
            </button>

            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div style={{ position: 'relative' }} ref={profileMenuRef}>
              <button className="profile-trigger" onClick={() => setShowProfileMenu(prev => !prev)}>
                <div className="profile-avatar">{session.user.email ? session.user.email.charAt(0).toUpperCase() : <User size={16} />}</div>
                <ChevronDown size={14} />
              </button>

              {showProfileMenu && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-header">
                    <div className="profile-avatar">
                      {session.user.email ? session.user.email.charAt(0).toUpperCase() : <User size={18} />}
                    </div>
                    <div className="profile-dropdown-info">
                      <div className="profile-dropdown-info-label">{t('loggedInAs')}</div>
                      <div className="profile-dropdown-info-email">{session.user.email}</div>
                    </div>
                  </div>

                  <div className="profile-dropdown-section">
                    <div className="profile-dropdown-row">
                      <span className="profile-dropdown-label">{t('themeLabel')}</span>
                      <button className="theme-toggle" onClick={toggleTheme}>
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                      </button>
                    </div>
                    <div className="profile-dropdown-row">
                      <span className="profile-dropdown-label">{t('languageLabel')}</span>
                      <div className="lang-switch">
                        <button type="button" className={language === 'so' ? 'active' : ''} onClick={() => changeLanguage('so')}>SO</button>
                        <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>EN</button>
                      </div>
                    </div>
                  </div>

                  <div className="profile-dropdown-menu">
                    <button className="profile-menu-item" onClick={() => { setActiveTab('settings'); setShowProfileMenu(false); }}>
                      <Settings size={16} /> {t('fullSettings')}
                    </button>
                    <button className="profile-menu-item danger" onClick={handleLogout}>
                      <LogOut size={16} /> {t('logOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

      {/* Main Content */}
      {!isConfigured ? (
        <div className="glass-card text-center py-12">
          <AlertCircle className="mx-auto mb-4" size={48} color="#5E17F5" />
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
                  <h3>{t('noChannelsTitle')}</h3>
                  <p className="mt-2">{t('noChannelsSub')}</p>
                </div>
              ) : (
                <div className="channels-grid">
                  {channels.map((channel) => (
                    <div key={channel.id} className={`glass-card channel-card ${channel.is_live ? 'is-live' : ''}`}>
                      <div className="channel-header">
                        <span className={`channel-platform ${channel.platform === 'youtube' ? 'platform-youtube' : 'platform-tiktok'}`}>
                          <span className={`platform-icon ${channel.platform === 'youtube' ? 'platform-icon-youtube' : 'platform-icon-tiktok'}`}>
                            {channel.platform === 'youtube' ? <Play size={10} fill="currentColor" /> : <Music2 size={11} />}
                          </span>
                          {channel.platform}
                        </span>
                        
                        <span className={`status-badge ${channel.is_live ? 'status-live' : 'status-offline'}`}>
                          {channel.is_live ? `🔴 ${t('statusLive')}` : t('statusOffline')}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                        {channel.avatar_url && !avatarErrors[channel.id] ? (
                          <img 
                            src={cleanAvatarUrl(channel.avatar_url)} 
                            alt={channel.name} 
                            className="channel-avatar"
                            onError={() => setAvatarErrors(prev => ({ ...prev, [channel.id]: true }))}
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--card-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                          />
                        ) : (
                          <div className="channel-avatar-placeholder" style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--surface-1)', border: '2px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
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
                          <div className="info-label">{t('lastChecked')}</div>
                          <div className="info-value">
                            {channel.last_checked ? new Date(channel.last_checked).toLocaleTimeString() : t('neverChecked')}
                          </div>
                        </div>

                        <div>
                          <div className="info-label">{t('lastVideo')}</div>
                          <div className="info-value">
                            {channel.last_video_url ? (
                              <a href={channel.last_video_url} target="_blank" rel="noopener noreferrer">
                                {t('viewVideo')}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-dimmed)' }}>{t('noVideoYet')}</span>
                            )}
                          </div>
                        </div>
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
                            <Play size={14} /> {t('watchLive')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ flex: 1, padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}
                            onClick={() => {
                              setActivePlayer({
                                channel,
                                type: 'video',
                                videoId: null
                              });
                            }}
                          >
                            <Video size={14} /> {t('watchVideos')}
                          </button>
                        )}
                        <button type="button" className="btn-delete-icon" onClick={() => handleDeleteChannel(channel.id)} title={t('deleteBtn')}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manager' && (
            <div className="glass-card" style={{ maxWidth: '640px', margin: '0 auto', width: '100%' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '20px' }}>{t('addChannelTitle')}</h2>
              
              {/* Mode Toggle Tabs */}
              <div className="tabs" style={{ display: 'flex', width: '100%', marginBottom: '24px' }}>
                <button 
                  type="button"
                  className={`tab-btn ${addMode === 'url' ? 'active' : ''}`}
                  onClick={() => { setAddMode('url'); setResolvedChannel(null); }}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  {t('addByUrl')}
                </button>
                <button
                  type="button"
                  className={`tab-btn ${addMode === 'manual' ? 'active' : ''}`}
                  onClick={() => { setAddMode('manual'); setResolvedChannel(null); }}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  {t('addManual')}
                </button>
              </div>

              {addMode === 'url' ? (
                <div>
                  <form onSubmit={handleResolveUrl} style={{ marginBottom: '20px' }}>
                    <div className="form-group">
                      <label>{t('channelUrlLabel')}</label>
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
                          {isResolving ? t('checkingLink') : t('checkLink')}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('urlSupportNote')}
                      </p>
                    </div>
                  </form>

                  {/* Channel Preview Card */}
                  {resolvedChannel && (
                    <div className="resolved-preview-card" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      background: 'var(--card-bg)',
                      border: resolvedChannel.platform === 'youtube' ? '1px solid rgba(255, 59, 48, 0.2)' : '1px solid var(--card-border)',
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
                            style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--card-border)' }}
                          />
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--surface-1)', border: '2px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-white)' }}>
                            {resolvedChannel.name ? resolvedChannel.name.charAt(0) : '@'}
                          </div>
                        )}
                        <span className={`channel-platform ${resolvedChannel.platform === 'youtube' ? 'platform-youtube' : 'platform-tiktok'}`} style={{
                          position: 'absolute',
                          bottom: '-6px',
                          right: '-6px',
                          fontSize: '0.6rem',
                          padding: '3px 8px',
                          borderRadius: '30px',
                          background: 'var(--surface-solid)',
                          border: '1px solid var(--card-border)',
                        }}>
                          {resolvedChannel.platform}
                        </span>
                      </div>
                      
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-white)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
                    {isLoading ? t('adding') : t('addChannelBtn')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddChannel}>
                  <div className="form-group">
                    <label>{t('platformLabel')}</label>
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
                    <label>{t('identifierLabel')}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={newChannel.platform === 'youtube' ? 'Tusaale: UC_x5XG1OV2P6uYZ5ji9FzGg' : 'Tusaale: khaby.lame'}
                      value={newChannel.identifier}
                      onChange={(e) => setNewChannel({...newChannel, identifier: e.target.value})}
                    />
                    {newChannel.platform === 'youtube' && (
                      <p className="text-xs text-gray-400 mt-1" style={{ fontSize: '0.8rem', marginTop: '-10px', marginBottom: '15px', color: 'var(--text-muted)' }}>
                        {t('youtubeIdNote')}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label>{t('displayNameLabel')}</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('displayNamePlaceholder')}
                      value={newChannel.name}
                      onChange={(e) => setNewChannel({...newChannel, name: e.target.value})}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary w-full flex items-center justify-center gap-2" disabled={isLoading} style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Plus size={18} />
                    {isLoading ? t('adding') : t('addBtn')}
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* E-Mail Settings Status Card */}
          <div className="glass-card" style={{ padding: '32px' }}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <Mail color="#5E17F5" size={24} /> 
              {language === 'so' ? 'Habaynta Ogeysiiska Email-ka' : 'Email Notification Settings'}
            </h2>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', marginBottom: '24px' }}>
              <div className={`status-pill ${isEmailConfigured ? 'status-pill-green' : 'status-pill-red'}`} style={{ flexShrink: 0 }}></div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: '4px' }}>
                  {isEmailConfigured 
                    ? (language === 'so' ? 'Google Apps Script: Waa diyaar' : 'Google Apps Script: Configured') 
                    : (language === 'so' ? 'Google Apps Script: Lalama xiriiri waayay' : 'Google Apps Script: Not Configured')}
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {isEmailConfigured 
                    ? (language === 'so' ? 'Ogeysiisyada email-ka waxaa si toos ah loogu soo diri doonaa email-kaaga hoos ku qoran.' : 'Email alerts will be sent automatically to your verified email below.') 
                    : (language === 'so' ? 'GAS_URL kuma jiro backend/.env. Fadlan raac tillaabooyinka hoose si aad u shido.' : 'GAS_URL is not set in backend/.env. Follow the steps below to configure.')}
                </p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {language === 'so' ? 'Email-kaaga (Ogeysiisyada lagugu soo dirayo)' : 'Your Email (For receiving notifications)'}
              </label>
              <input 
                type="email" 
                className="input-field"
                value={session?.user?.email || ''}
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'rgba(255,255,255,0.03)', marginTop: '8px' }}
              />
            </div>

            {isEmailConfigured && (
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} 
                onClick={sendTestEmail} 
                disabled={isLoading}
              >
                <Mail size={18} />
                {language === 'so' ? 'Tijaabi Email-ka' : 'Send Test Email'}
              </button>
            )}
          </div>

          {/* Setup Guide Card */}
          <div className="glass-card" style={{ padding: '32px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Settings size={20} color="#5E17F5" />
              {language === 'so' ? 'Sida loo diyaariyo Google Apps Script:' : 'How to set up Google Apps Script:'}
            </h3>
            
            <div style={{ fontSize: '0.88rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
              <ol className="list-decimal list-inside space-y-3" style={{ paddingLeft: '4px' }}>
                <li>
                  {language === 'so' 
                    ? <>Booqo <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)', textDecoration: 'underline'}}>script.google.com</a> oo ku samee mashruuc cusub (New Project).</>
                    : <>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{color: 'var(--accent-primary)', textDecoration: 'underline'}}>script.google.com</a> and create a new project.</>}
                </li>
                <li>
                  {language === 'so'
                    ? 'Ku shub (paste) koodhkan hoose qaybta code-ka:'
                    : 'Paste the following code into the editor:'}
                  <pre style={{ background: '#000', padding: '14px', borderRadius: '10px', marginTop: '8px', marginBottom: '8px', overflowX: 'auto', color: '#34c759', fontFamily: 'monospace', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                <li>
                  {language === 'so'
                    ? <>Guji <strong>Deploy</strong> &rarr; <strong>New Deployment</strong>.</>
                    : <>Click <strong>Deploy</strong> &rarr; <strong>New Deployment</strong>.</>}
                </li>
                <li>
                  {language === 'so'
                    ? <>Dooro nooca <strong>Web App</strong>.</>
                    : <>Select type <strong>Web App</strong>.</>}
                </li>
                <li>
                  {language === 'so'
                    ? <>U dooro Execute As: <strong>Me</strong> iyo Who has access: <strong>Anyone</strong> (Tani waa muhiim!).</>
                    : <>Set Execute As: <strong>Me</strong> and Who has access: <strong>Anyone</strong> (This is critical!).</>}
                </li>
                <li>
                  {language === 'so'
                    ? <>Guji <strong>Deploy</strong>, oggolow fasaxa (Authorize access), dabadeed nuqul ka qaado (copy) <strong>Web App URL</strong>.</>
                    : <>Click <strong>Deploy</strong>, authorize the access, then copy the generated <strong>Web App URL</strong>.</>}
                </li>
                <li>
                  {language === 'so'
                    ? <>Fungla <code>backend/.env</code>, ku dar <code>GAS_URL=halkan_geli_url_kaaga</code>, dabadeedna dib u kici server-ka backend-ka.</>
                    : <>Open <code>backend/.env</code>, add <code>GAS_URL=your_web_app_url_here</code>, and restart the backend server.</>}
                </li>
              </ol>
            </div>
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
                    {t('backBtn')}
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('noteInputLabel')}</span>
                  <select 
                    value={noteInputPosition}
                    onChange={(e) => setNoteInputPosition(e.target.value)}
                    className="select-field"
                    style={{
                      margin: 0,
                      padding: '0 28px 0 10px',
                      fontSize: '0.8rem',
                      height: '32px',
                      cursor: 'pointer',
                      width: 'auto'
                    }}
                  >
                    <option value="sidebar">{t('noteInputSidebar')}</option>
                    {activePlayer.videoId && <option value="overlay">{t('noteInputOverlay')}</option>}
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
                      <EyeOff size={14} /> {t('hideSidebar')}
                    </>
                  ) : (
                    <>
                      <Eye size={14} /> {t('showSidebar')}
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
                      <Minimize size={14} /> {t('exitFullscreen')}
                    </>
                  ) : (
                    <>
                      <Maximize size={14} /> {t('enterFullscreen')}
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
                    {t('goBackToLive')}
                  </button>
                )}

                {/* Close Button */}
                <button 
                  type="button" 
                  className="btn-close-modal" 
                  onClick={() => setActivePlayer(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Split screen */}
            <div className="player-modal-body">
              {activePlayer.type === 'video' && !activePlayer.videoId ? (
                <div className="modal-videos-grid-container" style={{ width: '100%', height: '100%', padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-white)', margin: 0 }}>
                      {t('playlistTitle')}
                    </h3>
                    {activePlayer.channel.platform === 'tiktok' && (
                      <div style={{ display: 'flex', gap: '8px', width: '400px' }}>
                        <input 
                          type="text" 
                          placeholder={t('tiktokLinkFieldPlaceholder')} 
                          className="input-field" 
                          style={{ flex: 1, fontSize: '0.8rem', height: '36px', padding: '0 10px', margin: 0 }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const url = e.target.value.trim();
                              const vId = extractTikTokId(url);
                              if (vId) {
                                addVideoIfMissing(vId, { url });
                                setActivePlayer(prev => ({ ...prev, videoId: vId }));
                                e.target.value = '';
                              } else {
                                showToast(t('toastInvalidTikTokLink'), 'error');
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {isLoadingVideos ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '80px 20px', fontSize: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <RefreshCw className="spin" size={32} style={{ color: 'var(--accent-primary)' }} />
                      {activePlayer.channel.platform === 'tiktok' ? t('loadingTiktok') : t('loadingPlaylist')}
                    </div>
                  ) : channelVideos.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '80px 20px', fontSize: '1rem' }}>
                      {t('noVideosFound')}
                    </div>
                  ) : (
                    <div className={`videos-grid${activePlayer.channel.platform === 'tiktok' ? ' tiktok' : ''}`}>
                      {channelVideos.map((video) => (
                        <div 
                          key={video.id} 
                          className="grid-video-card"
                          onClick={() => {
                            setActivePlayer(prev => ({
                              ...prev,
                              videoId: video.id
                            }));
                          }}
                        >
                          <div className="grid-video-thumbnail-wrapper">
                            {video.thumbnail ? (
                              <img 
                                src={video.thumbnail} 
                                alt={video.title} 
                                className="grid-video-thumbnail"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const fallback = e.target.parentNode.querySelector('.grid-video-fallback');
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className="grid-video-fallback" style={{ display: video.thumbnail ? 'none' : 'flex' }}>
                              <Youtube size={28} />
                            </div>
                          </div>
                          <div className="grid-video-info">
                            <h4 className="grid-video-title" title={video.title}>
                              {video.title}
                            </h4>
                            {video.published && (
                              <span className="grid-video-date">
                                {new Date(video.published).toLocaleDateString(language === 'so' ? 'so-SO' : 'en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                                  {t('backBtn')}
                                </button>
                                <input 
                                  type="text" 
                                  placeholder={t('tiktokLinkFieldPlaceholder')} 
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
                                        showToast(t('toastInvalidTikTokLink'), 'error');
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
                                  {t('tiktokLinkPrompt')}
                                </p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <input 
                                    type="text" 
                                    placeholder={t('pasteTiktokPlaceholder')} 
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
                                          showToast(t('toastInvalidTikTokLink'), 'error');
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
                                        showToast(t('toastInvalidTikTokLink'), 'error');
                                      }
                                    }}
                                  >
                                    {t('watchNowBtn')}
                                  </button>
                                </div>
                              </div>

                              {/* Latest videos grid fetched by the backend (TikTok's own creator
                                  embed widget is unreliable: it stays 1px tall when its resize
                                  handshake fails, so we render our own list instead). */}
                              <div style={{ flex: 1, minHeight: '400px', width: '100%' }}>
                                {isLoadingVideos ? (
                                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
                                    {t('loadingTiktok')}
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
                            placeholder={t('writeNotePlaceholder')}
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
                              fontSize: '0.85rem',
                              resize: 'none',
                              lineHeight: '1.3',
                              padding: '8px 12px',
                              background: 'var(--surface-solid)',
                              border: 'none',
                              borderRadius: '6px',
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
                          <button type="submit" className="btn btn-primary" style={{ padding: '0 10px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={16} />
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Notes / Playlist Sidebar */}
                  {showNotesPanel && (
                    <div className="notes-column">
                      {activePlayer.channel.platform === 'youtube' && (
                        <div className="segmented-control">
                          <button 
                            type="button"
                            className={`segmented-btn ${activeTabInModal === 'notes' ? 'active' : ''}`}
                            onClick={() => setActiveTabInModal('notes')}
                          >
                            <FileText size={16} />
                            {t('watchTabNotes')}
                          </button>
                          <button 
                            type="button"
                            className={`segmented-btn ${activeTabInModal === 'playlist' ? 'active' : ''}`}
                            onClick={() => setActiveTabInModal('playlist')}
                          >
                            <ListVideo size={16} />
                            {t('watchTabPlaylist')}
                          </button>
                        </div>
                      )}

                      {activeTabInModal === 'notes' || activePlayer.channel.platform !== 'youtube' ? (
                        <>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', color: 'var(--text-white)' }}>
                            {t('notesTitle')}
                          </h4>

                          {/* Notes List */}
                          <div className="notes-list-container">
                            {notes.length === 0 ? (
                              <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                                {t('emptyNotes')}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {notes.map((note) => (
                                  <div key={note.id} className="note-item">
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                                      {activePlayer.videoId && activePlayer.channel.platform === 'youtube' ? (
                                        <button
                                          type="button"
                                          className="note-timestamp-btn"
                                          onClick={() => seekPlayerTo(note.timestamp_seconds)}
                                        >
                                          {formatTimestamp(note.timestamp_seconds)}
                                        </button>
                                      ) : activePlayer.videoId ? (
                                        <span style={{
                                          background: '#f3f4f6',
                                          color: '#4b5563',
                                          border: '1px solid rgba(75, 85, 99, 0.15)',
                                          borderRadius: '6px',
                                          padding: '4px 8px',
                                          fontSize: '0.75rem',
                                          fontWeight: 700,
                                          fontFamily: 'monospace'
                                        }}>
                                          NOTE
                                        </span>
                                      ) : (
                                        <span style={{
                                          background: '#e6fffa',
                                          color: '#0d9488',
                                          border: '1px solid rgba(13, 148, 136, 0.15)',
                                          borderRadius: '6px',
                                          padding: '4px 8px',
                                          fontSize: '0.75rem',
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
                                      className="delete-note-btn"
                                      title="Tirtir note-ka"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Note Form (Only if position is Sidebar) */}
                          {noteInputPosition === 'sidebar' && (
                            <form onSubmit={handleAddNote} className="sidebar-note-form">
                              <div className="note-input-wrapper">
                                <textarea 
                                  className="sidebar-textarea" 
                                  placeholder={t('writeNotePlaceholder')}
                                  value={newNoteText}
                                  onChange={(e) => {
                                    setNewNoteText(e.target.value);
                                    e.target.style.height = '44px';
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleAddNote(e);
                                    }
                                  }}
                                  required
                                />
                                <button type="submit" className="note-submit-btn">
                                  <Plus size={18} />
                                </button>
                              </div>
                            </form>
                          )}
                        </>
                      ) : (
                        <>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', color: 'var(--text-white)' }}>
                            {t('playlistTitle')}
                          </h4>

                          {/* Video Playlist */}
                          <div className="notes-list-container">
                            {isLoadingVideos ? (
                              <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                                {t('loadingPlaylist')}
                              </div>
                            ) : channelVideos.length === 0 ? (
                              <div style={{ textAlign: 'center', color: 'var(--text-dimmed)', padding: '40px 20px', fontSize: '0.85rem' }}>
                                {t('noVideosFound')}
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default App;
