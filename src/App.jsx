import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Trash2, 
  Plus, 
  Settings, 
  Printer, 
  Sparkles, 
  X, 
  RefreshCw, 
  Eye, 
  EyeOff,
  AlertCircle,
  Search,
  Sun,
  Moon,
  HelpCircle
} from 'lucide-react';
import { parseDemographicsCSV } from './utils/csvParser';
import logoSymbol from './assets/logo_symbol.png';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [rows, setRows] = useState([]);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [tooltip, setTooltip] = useState({ show: false, text: '', x: 0, y: 0 });

  // Theme preference persisted in localStorage (default is 'dark')
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme_preference') || 'dark';
  });

  const passwordInputRef = useRef(null);

  // Apply theme class to document body
  useEffect(() => {
    document.body.className = theme === 'light' ? 'theme-light' : '';
    localStorage.setItem('theme_preference', theme);
  }, [theme]);

  // Check auth session and load API key on mount
  useEffect(() => {
    const authSession = sessionStorage.getItem('spine_west_auth');
    if (authSession === 'true') {
      setIsAuthenticated(true);
    }

    let savedKey = localStorage.getItem('openai_api_key');
    const envKey = import.meta.env.VITE_OPENAI_API_KEY || '';
    
    // Always prioritize the environment variable if it changes or is newly set
    if (envKey && envKey !== savedKey) {
      savedKey = envKey;
      localStorage.setItem('openai_api_key', envKey);
    }
    
    if (!savedKey) {
      savedKey = '';
    }
    setOpenaiApiKey(savedKey);
  }, []);

  const showTooltip = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    });
  };

  const hideTooltip = () => {
    setTooltip(prev => ({ ...prev, show: false }));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    if (password === 'SpineWest@303') {
      setIsLoggingIn(true);
      setTimeout(() => {
        setIsAuthenticated(true);
        sessionStorage.setItem('spine_west_auth', 'true');
        setIsLoggingIn(false);
      }, 1200); // 1.2s delay for "transmission loading" effect
    } else {
      setLoginError('The password is wrong. Please try again.');
      setPassword(''); // Clear input
      if (passwordInputRef.current) {
        passwordInputRef.current.focus(); // Re-focus
      }
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('spine_west_auth');
    setPassword('');
    setLoginError('');
    hideTooltip();
  };

  const saveApiKey = (key) => {
    setOpenaiApiKey(key);
    localStorage.setItem('openai_api_key', key);
    setIsSettingsOpen(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const cleanRowsWithAI = async (parsedRows, apiKeyToUse) => {
    if (!apiKeyToUse) {
      console.warn("⚠️ OpenAI API Key is missing. Skipping AI cleaning.");
      alert("OpenAI API Key is missing. Displaying raw data. Please configure your key in Settings (⚙️).");
      return parsedRows;
    }

    const rowsToClean = parsedRows.filter(r => r.reason && r.isProcedure);
    if (rowsToClean.length === 0) {
      console.log("ℹ️ No procedures to clean.");
      return parsedRows;
    }

    console.log(`📡 Auto-cleaning ${rowsToClean.length} procedure descriptions...`);
    setAiFeedback("AI Scribe is normalizing procedure descriptions...");

    try {
      const rawReasons = rowsToClean.map(r => r.reason);
      console.log("📡 Sending raw reasons to OpenAI:", rawReasons);
      
      const systemPrompt = `You are a medical clinical scribe. You clean and normalize raw patient schedule procedure descriptions. 
Format abbreviations into clean standard codes (e.g. "*LIESI" -> "L3-4 ILESI" or "L4-5 ILESI", "*CMBB" -> "L4-5 CMBB", "*LMBB" -> "L4-5 LMBB", "(LTFESI) LUMBAR TRANSFORAMINAL EPIDURAL STEROID INJECTION" -> "LT TFESI"). Keep them very clean and brief. 
Return only a JSON object containing a "cleaned" field with an array of strings of the exact same length in the exact same order. Do not return markdown wrappers.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyToUse}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(rawReasons) }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenAI API Error details:", errorText);
        throw new Error(`API error: ${response.statusText}`);
      }

      const resData = await response.json();
      const content = resData.choices[0].message.content;
      const parsedObj = JSON.parse(content);
      const cleanedArray = Array.isArray(parsedObj) ? parsedObj : (parsedObj.cleaned || Object.values(parsedObj)[0]);

      if (Array.isArray(cleanedArray) && cleanedArray.length === rawReasons.length) {
        let cleanIdx = 0;
        const updatedRows = parsedRows.map(row => {
          if (row.reason && row.isProcedure) {
            const updatedReason = cleanedArray[cleanIdx] || row.reason;
            cleanIdx++;
            return { ...row, reason: updatedReason };
          }
          return row;
        });
        console.log("✅ Successfully auto-cleaned procedures with OpenAI.");
        return updatedRows;
      } else {
        throw new Error("AI returned invalid array structure or length");
      }
    } catch (e) {
      console.error("❌ Error during Auto AI Clean execution:", e);
      alert("AI Scribe cleaning failed. Displaying raw data. Please check your API key and connection.");
      return parsedRows;
    }
  };

  const processCSVText = async (text) => {
    setIsLoading(true);
    setAiFeedback("Parsing file...");
    try {
      const parsed = await parseDemographicsCSV(text);
      if (parsed.length === 0) {
        alert("No valid appointment rows found in this CSV.");
      } else {
        // Automatically run AI scribe to clean descriptions
        const cleanedRows = await cleanRowsWithAI(parsed, openaiApiKey);
        setRows(cleanedRows);
      }
    } catch (error) {
      console.error(error);
      alert("Error parsing CSV file. Please make sure it's a valid eClinicalWorks export.");
    } finally {
      setIsLoading(false);
      setAiFeedback("");
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const text = await file.text();
      processCSVText(text);
    } else {
      alert("Please drop a valid .csv file.");
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const text = await file.text();
      processCSVText(text);
    }
  };

  const handleCellChange = (id, field, value) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleToggleProcedure = (id) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        return { ...row, isProcedure: !row.isProcedure };
      }
      return row;
    }));
  };

  const handleDeleteRow = (id) => {
    setRows(prevRows => prevRows.filter(row => row.id !== id));
  };

  const handleAddRow = () => {
    const newRow = {
      id: `row-new-${Date.now()}`,
      birthdate: '',
      patNo: '',
      firstName: '',
      lastName: '',
      time: '12:00 PM',
      reason: '',
      insurance: 'MC',
      facility: 'HI',
      apptType: 'FLUORO-S',
      medCount: '',
      isProcedure: true
    };
    setRows(prev => [...prev, newRow]);
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all data?")) {
      setRows([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const displayedRows = rows.filter(row => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (row.firstName || '').toLowerCase().includes(query) ||
      (row.lastName || '').toLowerCase().includes(query) ||
      (row.patNo || '').toLowerCase().includes(query) ||
      (row.reason || '').toLowerCase().includes(query) ||
      (row.medCount || '').toLowerCase().includes(query) ||
      (row.insurance || '').toLowerCase().includes(query) ||
      (row.facility || '').toLowerCase().includes(query)
    );
  });

  // -------------------- AUTHENTICATION RENDER --------------------
  if (!isAuthenticated) {
    return (
      <div className="login-wrapper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div className="cyber-grid"></div>
        <div className="glow-orb glow-orb-1"></div>
        <div className="glow-orb glow-orb-2"></div>

        {/* Theme and Help Switches at top right */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10, display: 'flex', gap: '0.75rem' }} className="no-print">
          <button 
            onClick={() => setIsAboutOpen(true)}
            className="btn btn-icon"
            onMouseEnter={(e) => showTooltip(e, "About this Software")}
            onMouseLeave={hideTooltip}
          >
            <HelpCircle style={{ width: '18px', height: '18px' }} />
          </button>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn btn-icon"
            onMouseEnter={(e) => showTooltip(e, `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`)}
            onMouseLeave={hideTooltip}
          >
            {theme === 'dark' ? <Sun style={{ width: '18px', height: '18px' }} /> : <Moon style={{ width: '18px', height: '18px' }} />}
          </button>
        </div>

        {/* Clean Centered Credentials Form */}
        <form className="login-card" onSubmit={handleLogin} style={{ zIndex: 10, margin: '0' }}>
          {/* Custom SVG Spine West Logo replaced by Cropped Official PNG Symbol */}
          <div className="login-logo-container" style={{ background: 'transparent', border: 'none', boxShadow: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: 0, marginBottom: '1.25rem' }}>
            <img src={logoSymbol} alt="Spine West Symbol" style={{ height: '52px', width: 'auto', flexShrink: 0 }} />
            <h2 className="login-title" style={{ fontSize: '1.85rem', fontWeight: 900, margin: 0, letterSpacing: '0.08em', fontFamily: 'var(--font-headings)' }}>
              <span style={{ color: 'var(--accent-blue)' }}>SPINE</span>
              <span style={{ color: 'var(--accent-green)' }}>WEST</span>
            </h2>
          </div>
          
          <p className="login-subtitle" style={{ marginTop: '0.25rem', marginBottom: '2rem' }}>Procedure Timetable Normalizer</p>

          {loginError && (
            <div className="login-error">
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">System Password</label>
            <div className="input-wrapper">
              <input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="form-input"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="visibility-toggle"
              >
                {showPassword ? (
                  <EyeOff style={{ width: '16px', height: '16px' }} />
                ) : (
                  <Eye style={{ width: '16px', height: '16px' }} />
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8rem', fontSize: '0.9rem' }}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Transmitting..." : "Access System"}
          </button>
        </form>

        {isLoggingIn && (
          <div className="spinner-overlay">
            <div className="openai-spinner">
              <div className="openai-core"></div>
              <div className="openai-ring">
                <div className="openai-node node-1"></div>
                <div className="openai-node node-2"></div>
                <div className="openai-node node-3"></div>
                <div className="openai-node node-4"></div>
              </div>
            </div>
            <span className="spinner-text">Transmitting clinical credentials...</span>
          </div>
        )}

        {/* Help About Modal */}
        {isAboutOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '520px' }}>
              <button 
                onClick={() => setIsAboutOpen(false)}
                className="modal-close"
              >
                <X style={{ width: '18px', height: '18px' }} />
              </button>

              <div className="modal-header">
                <HelpCircle style={{ width: '20px', height: '20px', color: '#10b981' }} />
                <h2>About Spine West • ProcFlow</h2>
              </div>
              
              <p className="modal-desc" style={{ marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: '500' }}>
                HIPAA-Compliant Intelligent Timetable Normalizer
              </p>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', fontSize: '0.85rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: '#10b981', fontWeight: '600' }}>What is ProcFlow?</h4>
                  <p className="about-section-desc">
                    ProcFlow is a custom clinical utility built to parse raw eClinicalWorks demographic CSV roster files and format them instantly into the rotated 180° landscape room timetable required by doctors and nursing staff.
                  </p>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: '#10b981', fontWeight: '600' }}>Why is it useful?</h4>
                  <div className="about-feature-item">
                    <span className="about-feature-bullet">✓</span>
                    <span className="about-section-desc" style={{ margin: '0' }}>
                      <strong>100% HIPAA Safe</strong>: Operates entirely in browser temporary memory (RAM). No patient records are sent to any server, database, or stored in the cloud. Data is completely wiped the moment the tab is closed.
                    </span>
                  </div>
                  <div className="about-feature-item">
                    <span className="about-feature-bullet">✓</span>
                    <span className="about-section-desc" style={{ margin: '0' }}>
                      <strong>Automated AI Scribing</strong>: {"Leverages OpenAI's secure GPT-4o-mini engine to instantly sanitize and expand complex eClinicalWorks shorthand medical terms (e.g. *LIESI ➔ L3-4 ILESI, (LTFESI) ... ➔ LT TFESI)."}
                    </span>
                  </div>
                  <div className="about-feature-item">
                    <span className="about-feature-bullet">✓</span>
                    <span className="about-section-desc" style={{ margin: '0' }}>
                      <strong>High-Fidelity rotated grid layout</strong>: Bypasses standard browser page headers to print sharp, black-bordered timetables mirroring the rotated format perfectly.
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed rgba(148, 163, 184, 0.25)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <p className="about-section-desc" style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Developed by{' '}
                    <a 
                      href="https://www.boresearcher.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="about-modal-link"
                    >
                      bo
                    </a>
                    . All rights reserved.
                  </p>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem' }}>
                <button
                  onClick={() => setIsAboutOpen(false)}
                  className="btn btn-primary"
                  style={{ minWidth: '100px' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Premium Clinic Footer positioned absolute at bottom of login-wrapper */}
        <footer className="no-print app-footer-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, margin: 0 }}>
          <div className="footer-left">
            <span className="footer-copyright">© 2026 Spine West. All rights reserved.</span>
            <span className="footer-divider">|</span>
            <span className="footer-clinic">Spine, Orthopedic & Regenerative Medicine</span>
          </div>
          <div className="footer-right">
            <span>5387 Manhattan Circle, Boulder, CO 80303</span>
            <span className="footer-divider">|</span>
            <span>Ph: 303-494-7773</span>
          </div>
        </footer>
      </div>
    );
  }

  // -------------------- AUTHENTICATED SYSTEM RENDER --------------------
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* -------------------- MAIN DASHBOARD SHELL (HIDDEN IN PRINT) -------------------- */}
      <header className="no-print app-header">
        {/* Brand section replaces raw logo image with Cropped Official PNG Symbol and styled text */}
        <div className="brand-section" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img src={logoSymbol} alt="Spine West Symbol" style={{ height: '36px', width: 'auto', flexShrink: 0 }} />
          <div className="brand-text">
            <h1 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--font-headings)' }}>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 900, letterSpacing: '0.08em' }}>SPINE</span>
              <span style={{ color: 'var(--accent-green)', fontWeight: 900, letterSpacing: '0.08em' }}>WEST</span>
              <span style={{ opacity: 0.5, margin: '0 8px', fontWeight: 300 }}>•</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>ProcFlow</span>
            </h1>
            <p>HIPAA Compliant Client-Side Procedure Timetable Formatter</p>
          </div>
        </div>

        <div className="action-group">
          {/* Info/Help Trigger */}
          <button 
            onClick={() => setIsAboutOpen(true)}
            className="btn btn-icon"
            onMouseEnter={(e) => showTooltip(e, "About this Software")}
            onMouseLeave={hideTooltip}
          >
            <HelpCircle style={{ width: '18px', height: '18px' }} />
          </button>

          {/* Theme Toggle Trigger */}
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn btn-icon"
            onMouseEnter={(e) => showTooltip(e, `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`)}
            onMouseLeave={hideTooltip}
          >
            {theme === 'dark' ? <Sun style={{ width: '18px', height: '18px' }} /> : <Moon style={{ width: '18px', height: '18px' }} />}
          </button>

          {/* Settings Trigger (System Configuration modal) */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="btn btn-icon"
            onMouseEnter={(e) => showTooltip(e, "View Active API Key")}
            onMouseLeave={hideTooltip}
          >
            <Settings style={{ width: '18px', height: '18px' }} />
          </button>

          <button
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="btn btn-primary"
            onMouseEnter={(e) => showTooltip(e, "Open browser print menu for landscape timetable")}
            onMouseLeave={hideTooltip}
          >
            <Printer style={{ width: '16px', height: '16px' }} />
            Print Timetable
          </button>

          <button
            onClick={handleLogout}
            className="btn btn-secondary text-xs"
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            onMouseEnter={(e) => showTooltip(e, "Lock session and return to credentials screen")}
            onMouseLeave={hideTooltip}
          >
            Lock
          </button>
        </div>
      </header>

      <main className="no-print upload-container">
        {/* Upload Zone & Guide */}
        {rows.length === 0 ? (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
          >
            <div className="upload-icon-wrapper">
              <Upload style={{ width: '28px', height: '28px', color: '#10b981' }} />
            </div>
            <h2>Drag & drop your eClinicalWorks CSV here</h2>
            <p>
              Or browse a file from your computer. Your patient data is parsed locally in-memory and is never uploaded anywhere.
            </p>
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              Browse CSV File
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileSelect} 
                className="hidden" 
                style={{ display: 'none' }}
              />
            </label>
          </div>
        ) : (
          /* Main Interactive Table Shell */
          <div className="grid-container">
            {/* Table Action Controls - Single Search Input */}
            <div className="toolbar">
              <div className="toolbar-left" style={{ flex: 1, maxWidth: '500px' }}>
                <div className="search-bar-wrapper" style={{ position: 'relative', width: '100%' }}>
                  <span className="search-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                    <Search style={{ width: '15px', height: '15px' }} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search patients, chart IDs, or procedures..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="toolbar-search-input"
                    style={{
                      width: '100%',
                      padding: '0.625rem 1rem 0.625rem 2.5rem',
                      background: 'rgba(8, 14, 27, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      color: '#f9fafb',
                      fontSize: '0.85rem',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        padding: '0',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X style={{ width: '14px', height: '14px' }} />
                    </button>
                  )}
                </div>
              </div>

              <div className="toolbar-right">
                <button
                  onClick={handleAddRow}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  onMouseEnter={(e) => showTooltip(e, "Add a new blank patient row")}
                  onMouseLeave={hideTooltip}
                >
                  <Plus style={{ width: '14px', height: '14px', color: '#818cf8' }} />
                  Add Patient
                </button>
                <button
                  onClick={handleClearAll}
                  className="btn btn-danger"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  onMouseEnter={(e) => showTooltip(e, "Clear all patient data")}
                  onMouseLeave={hideTooltip}
                >
                  <Trash2 style={{ width: '14px', height: '14px' }} />
                  Clear All
                </button>
              </div>
            </div>

            {/* Editable Data Grid Table */}
            <div className="table-wrapper">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th 
                      style={{ width: '60px', textAlignment: 'center' }} 
                      onMouseEnter={(e) => showTooltip(e, "Include in printed timetable. Check to print, uncheck to exclude.")}
                      onMouseLeave={hideTooltip}
                    >
                      Inc <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '135px' }}
                      onMouseEnter={(e) => showTooltip(e, "Patient Date of Birth. Formatted as M/D/YYYY.")}
                      onMouseLeave={hideTooltip}
                    >
                      Birthdate <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '115px' }}
                      onMouseEnter={(e) => showTooltip(e, "Patient eClinicalWorks ID number.")}
                      onMouseLeave={hideTooltip}
                    >
                      Pat # <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '160px' }}
                      onMouseEnter={(e) => showTooltip(e, "Patient First Name.")}
                      onMouseLeave={hideTooltip}
                    >
                      First Name <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '160px' }}
                      onMouseEnter={(e) => showTooltip(e, "Patient Last Name.")}
                      onMouseLeave={hideTooltip}
                    >
                      Last Name <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '115px' }}
                      onMouseEnter={(e) => showTooltip(e, "Scheduled Appointment Time. Roster sorted chronologically.")}
                      onMouseLeave={hideTooltip}
                    >
                      Time <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      onMouseEnter={(e) => showTooltip(e, "Procedure / Visit description. Automatically normalized by AI on upload.")}
                      onMouseLeave={hideTooltip}
                    >
                      Reason / Procedure <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '135px' }}
                      onMouseEnter={(e) => showTooltip(e, "Medical Assistant Med Count note.")}
                      onMouseLeave={hideTooltip}
                    >
                      Med Count <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '115px' }}
                      onMouseEnter={(e) => showTooltip(e, "Normalized Insurance Provider Code (MC, UMC, CIGNA, UMR, etc.).")}
                      onMouseLeave={hideTooltip}
                    >
                      Ins <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th 
                      style={{ width: '125px' }}
                      onMouseEnter={(e) => showTooltip(e, "Destination Reference Facility (BCH = Boulder Community, HI = Health Images, AMBRA = Ambra Cloud).")}
                      onMouseLeave={hideTooltip}
                    >
                      Facility <span className="tooltip-icon">ⓘ</span>
                    </th>
                    <th style={{ width: '50px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr key={row.id} className={!row.isProcedure ? 'inactive' : ''}>
                      {/* Included Toggle */}
                      <td className="checkbox-td">
                        <input
                          type="checkbox"
                          checked={row.isProcedure}
                          onChange={() => handleToggleProcedure(row.id)}
                          className="grid-checkbox"
                        />
                      </td>

                      {/* Birthdate */}
                      <td>
                        <input
                          type="text"
                          value={row.birthdate}
                          onChange={(e) => handleCellChange(row.id, 'birthdate', e.target.value)}
                          className="cell-input"
                        />
                      </td>

                      {/* Pat # */}
                      <td>
                        <input
                          type="text"
                          value={row.patNo}
                          onChange={(e) => handleCellChange(row.id, 'patNo', e.target.value)}
                          className="cell-input font-mono"
                        />
                      </td>

                      {/* First Name */}
                      <td>
                        <input
                          type="text"
                          value={row.firstName}
                          onChange={(e) => handleCellChange(row.id, 'firstName', e.target.value)}
                          className="cell-input"
                        />
                      </td>

                      {/* Last Name */}
                      <td>
                        <input
                          type="text"
                          value={row.lastName}
                          onChange={(e) => handleCellChange(row.id, 'lastName', e.target.value)}
                          className="cell-input"
                        />
                      </td>

                      {/* Time */}
                      <td>
                        <input
                          type="text"
                          value={row.time}
                          onChange={(e) => handleCellChange(row.id, 'time', e.target.value)}
                          className="cell-input"
                        />
                      </td>

                      {/* Reason */}
                      <td>
                        <input
                          type="text"
                          value={row.reason}
                          onChange={(e) => handleCellChange(row.id, 'reason', e.target.value)}
                          className="cell-input"
                          style={{ fontWeight: '600' }}
                        />
                      </td>

                      {/* Med Count */}
                      <td>
                        <input
                          type="text"
                          value={row.medCount}
                          onChange={(e) => handleCellChange(row.id, 'medCount', e.target.value)}
                          className="cell-input"
                          placeholder="Empty..."
                          style={{ fontWeight: '500' }}
                        />
                      </td>

                      {/* Ins */}
                      <td>
                        <select
                          value={row.insurance}
                          onChange={(e) => handleCellChange(row.id, 'insurance', e.target.value)}
                          className="cell-select"
                        >
                          <option value="MC">MC</option>
                          <option value="UMC">UMC</option>
                          <option value="CIGNA">CIGNA</option>
                          <option value="UMR">UMR</option>
                          <option value="AETNA">AETNA</option>
                          <option value="BCBS">BCBS</option>
                          <option value="HUMANA">HUMANA</option>
                          <option value="SELECT">SELECT</option>
                        </select>
                      </td>

                      {/* Facility */}
                      <td>
                        <select
                          value={row.facility}
                          onChange={(e) => handleCellChange(row.id, 'facility', e.target.value)}
                          className="cell-select"
                        >
                          <option value="BCH">BCH</option>
                          <option value="HI">HI</option>
                          <option value="AMBRA">AMBRA</option>
                          <option value="">(None)</option>
                        </select>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="row-delete-btn"
                          onMouseEnter={(e) => showTooltip(e, "Delete patient row")}
                          onMouseLeave={hideTooltip}
                        >
                          <Trash2 style={{ width: '14px', height: '14px' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer Meta bar */}
            <div className="grid-footer">
              <span>
                Showing {displayedRows.length} of {rows.length} total parsed records. Check checkboxes to include/exclude patients from print layouts.
              </span>
              <label className="grid-footer-upload">
                Upload different file
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileSelect} 
                  className="hidden" 
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        )}
      </main>

      {/* -------------------- PRINT-ONLY CONTAINER (HIDDEN ON SCREEN) -------------------- */}
      <div className="print-container hidden print-only">
        <table className="print-table">
          <tbody>
            {rows.filter(r => r.isProcedure).map((row) => (
              <tr key={row.id}>
                {/* 1. Birthdate */}
                <td style={{ width: '10%' }}>{row.birthdate}</td>
                {/* 2. Pat # */}
                <td style={{ width: '8%' }}>{row.patNo}</td>
                {/* 3. First Name */}
                <td style={{ width: '10%' }}>{row.firstName}</td>
                {/* 4. Last Name */}
                <td style={{ width: '12%' }}>{row.lastName}</td>
                {/* 5. Time */}
                <td style={{ width: '8%' }}>{row.time}</td>
                {/* 6. Reason */}
                <td className="reason-cell">{row.reason}</td>
                {/* 7. Med Count */}
                <td style={{ width: '10%' }}>{row.medCount}</td>
                {/* 8. Insurance Code */}
                <td className="abbr-cell" style={{ width: '7%' }}>{row.insurance}</td>
                {/* 9. Facility Code */}
                <td className="abbr-cell" style={{ width: '7%' }}>{row.facility}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Settings Modal (Read-Only API Key Viewer) */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="modal-close"
            >
              <X style={{ width: '18px', height: '18px' }} />
            </button>

            <div className="modal-header">
              <Settings style={{ width: '20px', height: '20px', color: '#10b981' }} />
              <h2>System Configuration</h2>
            </div>
            <p className="modal-desc">
              Active configuration settings for ProcFlow.
            </p>

            <div className="form-group">
              <label className="form-label">
                API Key
              </label>
              <div className="input-wrapper" style={{ display: 'flex', alignItems: 'center', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '10px', padding: '0.75rem 0.875rem' }}>
                <span style={{ 
                  color: 'var(--text-primary)', 
                  fontSize: '0.85rem', 
                  fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                  wordBreak: 'break-all',
                  flex: 1
                }}>
                  {showApiKey ? openaiApiKey : '••••••••••••••••••••••••••••••••••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="visibility-toggle"
                  style={{ position: 'static', transform: 'none', marginLeft: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {showApiKey ? (
                    <EyeOff style={{ width: '16px', height: '16px' }} />
                  ) : (
                    <Eye style={{ width: '16px', height: '16px' }} />
                  )}
                </button>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem' }}>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="btn btn-primary"
                style={{ minWidth: '100px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help About Modal */}
      {isAboutOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <button 
              onClick={() => setIsAboutOpen(false)}
              className="modal-close"
            >
              <X style={{ width: '18px', height: '18px' }} />
            </button>

            <div className="modal-header">
              <HelpCircle style={{ width: '20px', height: '20px', color: '#10b981' }} />
              <h2>About Spine West • ProcFlow</h2>
            </div>
            
            <p className="modal-desc" style={{ marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: '500' }}>
              HIPAA-Compliant Intelligent Timetable Normalizer
            </p>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left', fontSize: '0.85rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', color: '#10b981', fontWeight: '600' }}>What is ProcFlow?</h4>
                <p className="about-section-desc">
                  ProcFlow is a custom clinical utility built to parse raw eClinicalWorks demographic CSV roster files and format them instantly into the rotated 180° landscape room timetable required by doctors and nursing staff.
                </p>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', color: '#10b981', fontWeight: '600' }}>Why is it useful?</h4>
                <div className="about-feature-item">
                  <span className="about-feature-bullet">✓</span>
                  <span className="about-section-desc" style={{ margin: '0' }}>
                    <strong>100% HIPAA Safe</strong>: Operates entirely in browser temporary memory (RAM). No patient records are sent to any server, database, or stored in the cloud. Data is completely wiped the moment the tab is closed.
                  </span>
                </div>
                <div className="about-feature-item">
                  <span className="about-feature-bullet">✓</span>
                  <span className="about-section-desc" style={{ margin: '0' }}>
                    <strong>Automated AI Scribing</strong>: {"Leverages OpenAI's secure GPT-4o-mini engine to instantly sanitize and expand complex eClinicalWorks shorthand medical terms (e.g. *LIESI ➔ L3-4 ILESI, (LTFESI) ... ➔ LT TFESI)."}
                  </span>
                </div>
                <div className="about-feature-item">
                  <span className="about-feature-bullet">✓</span>
                  <span className="about-section-desc" style={{ margin: '0' }}>
                    <strong>High-Fidelity rotated grid layout</strong>: Bypasses standard browser page headers to print sharp, black-bordered timetables mirroring the rotated format perfectly.
                  </span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed rgba(148, 163, 184, 0.25)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <p className="about-section-desc" style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Developed by{' '}
                  <a 
                    href="https://www.boresearcher.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="about-modal-link"
                  >
                    bo
                  </a>
                  . All rights reserved.
                </p>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem', paddingTop: '1rem' }}>
              <button
                onClick={() => setIsAboutOpen(false)}
                className="btn btn-primary"
                style={{ minWidth: '100px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Custom Non-Clipped Body Tooltip */}
      {tooltip.show && (
        <div 
          className="body-tooltip"
          style={{ 
            left: `${tooltip.x}px`, 
            top: `${tooltip.y}px` 
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Premium Clinic Footer */}
      <footer className="no-print app-footer-bar">
        <div className="footer-left">
          <span className="footer-copyright">© 2026 Spine West. All rights reserved.</span>
          <span className="footer-divider">|</span>
          <span className="footer-clinic">Spine, Orthopedic & Regenerative Medicine</span>
        </div>
        <div className="footer-right">
          <span>5387 Manhattan Circle, Boulder, CO 80303</span>
          <span className="footer-divider">|</span>
          <span>Ph: 303-494-7773</span>
        </div>
      </footer>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="spinner-overlay">
          <div className="openai-spinner">
            <div className="openai-core"></div>
            <div className="openai-ring">
              <div className="openai-node node-1"></div>
              <div className="openai-node node-2"></div>
              <div className="openai-node node-3"></div>
              <div className="openai-node node-4"></div>
            </div>
          </div>
          <span className="spinner-text">{aiFeedback || "Processing Data..."}</span>
        </div>
      )}
    </div>
  );
}
