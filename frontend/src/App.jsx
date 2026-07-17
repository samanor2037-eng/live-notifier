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
  const [supabaseConfig, setSupabaseConfig] = useState({
    url: localStorage.getItem('SB_URL') || import.meta.env.VITE_SUPABASE_URL || '',
    key: localStorage.getItem('SB_KEY') || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  });
  
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

  // Initialize Supabase Client
  useEffect(() => {
    if (supabaseConfig.url && supabaseConfig.key && !supabaseConfig.url.includes('your-supabase')) {
      const client = createClient(supabaseConfig.url, supabaseConfig.key);
      setSupabase(client);
      setIsConfigured(true);
    } else {
      setSupabase(null);
      setIsConfigured(false);
    }
  }, [supabaseConfig]);

  // Load channels and SMTP settings
  useEffect(() => {
    if (!supabase) return;
    
    fetchChannels();
    fetchSettings();
    
    // Subscribe to Realtime database updates
    const channelSubscription = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels' },
        (payload) => {
          console.log('Realtime DB Change:', payload);
          if (payload.eventType === 'UPDATE') {
            // Trigger local alerts if channel goes live
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
  }, [supabase, soundEnabled]);

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
      const { data, error } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
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

  const handleSaveSupabase = (e) => {
    e.preventDefault();
    localStorage.setItem('SB_URL', supabaseConfig.url);
    localStorage.setItem('SB_KEY', supabaseConfig.key);
    showToast('Xogta Supabase waa la kaydiyay!');
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
          is_live: false
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
        value: smtp
      });
      
      if (error) throw error;
      showToast('SMTP settings waa la kaydiyay!');
    } catch (err) {
      showToast('Fashil: Kaydinta SMTP', 'error');
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
        body: JSON.stringify({ smtp_config: smtp })
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
        <div className="settings-grid">
          {/* SMTP & Testing */}
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
                </select>
              </div>

              {(!smtp.provider || smtp.provider === 'smtp') ? (
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
                <label>Geli Email-kaaga (Laguugu soo dirayo ogeysiiska)</label>
                <input 
                  type="email" 
                  className="input-field"
                  placeholder="emailkaaga@gmail.com"
                  value={smtp.to_email || ''}
                  onChange={(e) => setSmtp({...smtp, to_email: e.target.value})}
                />
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

          {/* Database Config */}
          <div className="glass-card">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Shield color="#007aff" /> Supabase Connection
            </h2>
            
            <form onSubmit={handleSaveSupabase}>
              <div className="form-group">
                <label>Supabase URL</label>
                <input 
                  type="text" 
                  className="input-field"
                  placeholder="https://xyz.supabase.co"
                  value={supabaseConfig.url}
                  onChange={(e) => setSupabaseConfig({...supabaseConfig, url: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>Supabase Anon Key</label>
                <input 
                  type="password" 
                  className="input-field"
                  placeholder="eyJhbGciOi..."
                  value={supabaseConfig.key}
                  onChange={(e) => setSupabaseConfig({...supabaseConfig, key: e.target.value})}
                />
              </div>
              
              <button type="submit" className="btn btn-primary w-full">
                Xaqiiji & Kaydi
              </button>
              
              <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-400">
                <p className="font-semibold text-white mb-2">Sida loo diyaariyo Supabase:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Sameyso mashruuc bilaash ah oo Supabase ah.</li>
                  <li>Ku shub shaxda SQL ee ku jirta faylka <code>supabase_setup.sql</code> qaybta SQL Editor.</li>
                  <li>Nuqul ka qaado URL-ka iyo API Key, kuna kaydi halkan.</li>
                </ol>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
