import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Bell, BellOff, Settings, Users, Radio, Video, Plus, Trash2, 
  Mail, Shield, RefreshCw, AlertCircle, Youtube, CheckCircle2, Play
} from 'lucide-react';

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

  // Initialize Supabase Client dynamically from backend config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('http://localhost:5001/api/config');
        const data = await res.json();
        if (data.supabaseUrl && data.supabaseKey && !data.supabaseUrl.includes('your-supabase')) {
          const client = createClient(data.supabaseUrl, data.supabaseKey);
          setSupabase(client);
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
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Load channels and SMTP settings when session is active
  useEffect(() => {
    if (!supabase || !session) return;
    
    fetchChannels();
    fetchSettings();
    
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

    return () => {
      supabase.removeChannel(channelSubscription);
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
      const { data, error } = await supabase.from('settings').select('*').eq('key', 'smtp_config').single();
      if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
      if (data && data.value) {
        setSmtp(data.value);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast('Waa laguu saaray akoonka (Logged Out).');
  };

  const handleAddChannel = async (e) => {
    e.preventDefault();
    if (!newChannel.identifier || !newChannel.name) {
      showToast('Fadlan buuxi dhammaan meelaha banaan', 'error');
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.from('channels').insert([
        {
          platform: newChannel.platform,
          identifier: newChannel.identifier.trim(),
          name: newChannel.name.trim(),
          is_live: false,
          user_id: session.user.id
        }
      ]);
      
      if (error) throw error;
      
      showToast('Kanaalka si guul leh ayaa loo daray!');
      setNewChannel({ platform: 'youtube', identifier: '', name: '' });
      fetchChannels();
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
      const res = await fetch('http://localhost:5001/api/check', { method: 'POST' });
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
      const res = await fetch('http://localhost:5001/api/send-test-email', {
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
        
        <div className="glass-card text-center" style={{ maxWidth: '420px', width: '100%', padding: '40px 30px' }}>
          <Radio className="mx-auto mb-6 animate-pulse" color="#ff3b30" size={64} style={{ margin: '0 auto 20px auto' }} />
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '10px' }}>Social Live Notifier</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.95rem', lineHeight: '1.5' }}>
            La soco marka dadka aad rabto ay Live galaan ama muuqaal cusub soo dhigaan. Geli akoonkaaga Google si aad u bilowdo.
          </p>
          <button className="btn btn-primary w-full flex items-center justify-center gap-3 py-3" onClick={handleGoogleLogin} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px', borderRadius: '8px', fontSize: '1rem' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M12.24 10.285V14.4h6.887C18.2 16.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.706 0 3.257.618 4.47 1.637l3.202-3.202C17.996 1.054 15.26 0 12.24 0 5.58 0 0 5.58 0 12.24s5.58 12.24 12.24 12.24c6.76 0 11.76-4.76 11.76-11.76 0-.796-.08-1.571-.22-2.315h-11.54z"/>
            </svg>
            Geli Akoonka Google (Sign In)
          </button>
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
                      
                      <div>
                        <div className="channel-name">{channel.name}</div>
                        <div className="channel-identifier">
                          ID: {channel.identifier}
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
                      
                      <button className="btn-delete" onClick={() => handleDeleteChannel(channel.id)}>
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
              <h2 className="text-xl font-bold mb-6">Ku dar Kanaal Cusub</h2>
              
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
                    <p className="text-xs text-gray-400 mt-1" style={{ fontSize: '0.8rem', marginTop: '-10px', marginBottom: '15px' }}>
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
                
                <button type="submit" className="btn btn-primary w-full flex items-center justify-center gap-2" disabled={isLoading}>
                  <Plus size={18} />
                  {isLoading ? 'Lagu darayaa...' : 'Ku Dar'}
                </button>
              </form>
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
    </div>
  );
}

export default App;
