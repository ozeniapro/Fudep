import React, { useState, useEffect } from 'react';
import { Upload, Settings, RotateCcw, Check, Image as ImageIcon, AlertCircle, FileText } from 'lucide-react';
import { DEFAULT_FUDEP_LOGO_BASE64 } from '../assets/defaultLogoBase64';
import { fetchLogoFromDb, saveLogoToDb } from '../lib/firebaseSync';

// Canvas compressor helper: resizes image to max 512px PNG Data URL for high performance & 100% offline persistence
function compressImageToDataUrl(file: File, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png', 0.9);
          resolve(dataUrl);
        } else {
          resolve(e.target?.result as string || DEFAULT_FUDEP_LOGO_BASE64);
        }
      };
      img.onerror = () => resolve(e.target?.result as string || DEFAULT_FUDEP_LOGO_BASE64);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper function to automatically convert share links from Google Drive & Dropbox into raw direct images
function parseImageUrl(url: string): { cleanUrl: string; isConverted: boolean; serviceName: string } {
  if (!url) return { cleanUrl: '', isConverted: false, serviceName: '' };
  let cleanUrl = url.trim();

  // 1. Google Drive Conversion
  const driveFileMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch && driveFileMatch[1]) {
    return {
      cleanUrl: `https://drive.google.com/uc?export=view&id=${driveFileMatch[1]}`,
      isConverted: true,
      serviceName: 'Google Drive'
    };
  }
  const driveOpenMatch = cleanUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (driveOpenMatch && driveOpenMatch[1]) {
    return {
      cleanUrl: `https://drive.google.com/uc?export=view&id=${driveOpenMatch[1]}`,
      isConverted: true,
      serviceName: 'Google Drive'
    };
  }

  // 2. Dropbox Conversion
  if (cleanUrl.includes('dropbox.com')) {
    let parsed = cleanUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    parsed = parsed.replace('?dl=0', '').replace('&dl=0', '');
    if (!parsed.includes('?')) {
      parsed += '?raw=1';
    } else if (!parsed.includes('raw=1')) {
      parsed += '&raw=1';
    }
    return {
      cleanUrl: parsed,
      isConverted: true,
      serviceName: 'Dropbox'
    };
  }

  return { cleanUrl, isConverted: false, serviceName: '' };
}

export function AdminSettingsTab() {
  const [logoOption, setLogoOption] = useState<'upload' | 'url'>('upload');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>(DEFAULT_FUDEP_LOGO_BASE64);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  // Custom states for helper diagnostics
  const [conversionInfo, setConversionInfo] = useState<{ isConverted: boolean; serviceName: string }>({ isConverted: false, serviceName: '' });
  const [hasPreviewError, setHasPreviewError] = useState<boolean>(false);

  useEffect(() => {
    // 1. Instant check from localStorage
    const savedLogo = localStorage.getItem('fudep_custom_logo');
    if (savedLogo && savedLogo.length > 20) {
      setPreviewUrl(savedLogo);
      if (savedLogo.startsWith('http')) {
        setLogoUrl(savedLogo);
        setLogoOption('url');
        const parsed = parseImageUrl(savedLogo);
        if (parsed.isConverted) {
          setConversionInfo({ isConverted: true, serviceName: parsed.serviceName });
        }
      }
    } else {
      setPreviewUrl(DEFAULT_FUDEP_LOGO_BASE64);
    }

    // 2. Fetch official logo persisted globally in Firestore
    fetchLogoFromDb().then((logoFromDb) => {
      if (logoFromDb && logoFromDb.length > 20) {
        setPreviewUrl(logoFromDb);
        if (logoFromDb.startsWith('http')) {
          setLogoUrl(logoFromDb);
        }
        localStorage.setItem('fudep_custom_logo', logoFromDb);
      }
    }).catch(err => {
      console.error("Failed to load logo from Firestore:", err);
    });
  }, []);

  const handleLogoSave = async (urlToSave: string) => {
    setIsSaving(true);
    try {
      if (!urlToSave) {
        localStorage.removeItem('fudep_custom_logo');
        await saveLogoToDb(DEFAULT_FUDEP_LOGO_BASE64);
      } else {
        localStorage.setItem('fudep_custom_logo', urlToSave);
        await saveLogoToDb(urlToSave);
      }
      
      // Dispatch custom event to notify all FudepLogo components across the app
      window.dispatchEvent(new Event('fudep_logo_updated'));
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error("Save logo error:", e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    try {
      const base64String = await compressImageToDataUrl(file, 512);
      setPreviewUrl(base64String);
      setConversionInfo({ isConverted: false, serviceName: '' });
      setHasPreviewError(false);
      await handleLogoSave(base64String);
    } catch (err) {
      console.error("Error compressing file:", err);
    }
  };

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleReset = async () => {
    if (window.confirm("Voulez-vous restaurer le logo officiel de Fudep par défaut ?")) {
      localStorage.removeItem('fudep_custom_logo');
      setPreviewUrl(DEFAULT_FUDEP_LOGO_BASE64);
      setLogoUrl('');
      setConversionInfo({ isConverted: false, serviceName: '' });
      setHasPreviewError(false);
      await saveLogoToDb(DEFAULT_FUDEP_LOGO_BASE64);
      window.dispatchEvent(new Event('fudep_logo_updated'));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleUrlInputChange = (val: string) => {
    setLogoUrl(val);
    if (!val) {
      setPreviewUrl(DEFAULT_FUDEP_LOGO_BASE64);
      setConversionInfo({ isConverted: false, serviceName: '' });
      setHasPreviewError(false);
      return;
    }

    const parsed = parseImageUrl(val);
    setPreviewUrl(parsed.cleanUrl);
    setConversionInfo({ isConverted: parsed.isConverted, serviceName: parsed.serviceName });
  };

  const handleUrlSubmit = () => {
    const parsed = parseImageUrl(logoUrl);
    if (parsed.cleanUrl) {
      handleLogoSave(parsed.cleanUrl);
    } else {
      handleLogoSave(DEFAULT_FUDEP_LOGO_BASE64);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in text-slate-800 pb-10">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-3">
          <Settings className="w-5 h-5 text-[#0f4c81]" />
          <div>
            <h3 className="font-serif font-bold text-slate-800 text-base">Personnalisation du Logo</h3>
            <p className="text-[11px] text-slate-400">Configurez et résolvez les problèmes d'affichage du logo Fudep</p>
          </div>
        </div>

        {/* 1. LOGO PREVIEW CONTAINER WITH DIAGNOSTICS */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100 mb-5 text-center relative overflow-hidden">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-3">Aperçu en temps réel</span>
          
          <div className="relative">
            <div className={`w-24 h-24 bg-white rounded-2xl shadow-md border flex items-center justify-center p-3 transition-transform hover:scale-105 duration-300 ${hasPreviewError ? 'border-red-300 bg-red-50/20' : 'border-slate-200/60'}`}>
              <img 
                src={previewUrl} 
                alt="Fudep Logo Preview" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onLoad={() => setHasPreviewError(false)}
                onError={() => {
                  setHasPreviewError(true);
                }}
              />
            </div>
            
            {hasPreviewError && (
              <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-1 shadow-sm" title="Erreur de chargement">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            )}
          </div>

          <span className="text-xs font-bold text-[#0f4c81] mt-3">Fudep Nails Marketplace</span>

          {/* Real-time Loading Diagnostics */}
          {hasPreviewError && logoUrl ? (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-left max-w-sm">
              <span className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> L'image ne peut pas être chargée :
              </span>
              <p className="text-[10px] text-red-600 mt-1 leading-normal">
                Le lien fourni n'est pas un lien d'image direct, ou l'hébergeur bloque l'accès extérieur (CORS). 
                <br />
                <strong>💡 Solution simple :</strong> Utilisez l'option <strong>"Importer un fichier"</strong> ci-dessous pour charger votre image directement depuis votre appareil. C'est 100% garanti et fonctionne hors-ligne.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 max-w-[240px] mt-1 leading-normal">
              Ce logo s'affiche instantanément dans l'en-tête de la marketplace et les communications.
            </p>
          )}

          {/* Autoconversion Toast Notification */}
          {conversionInfo.isConverted && (
            <div className="mt-2.5 px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg flex items-center gap-1.5 animate-pulse">
              <Check className="w-3 h-3 text-emerald-600" /> Lien {conversionInfo.serviceName} converti automatiquement en format brut !
            </div>
          )}
        </div>

        {/* 2. LOGO CONFIGURATION OPTIONS */}
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs gap-1">
            <button
              type="button"
              onClick={() => {
                setLogoOption('upload');
                setHasPreviewError(false);
              }}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${logoOption === 'upload' ? 'bg-white text-[#0f4c81] shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Upload className="w-3.5 h-3.5" />
              Importer un fichier (Recommandé)
            </button>
            <button
              type="button"
              onClick={() => setLogoOption('url')}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${logoOption === 'url' ? 'bg-white text-[#0f4c81] shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Lien Image Internet
            </button>
          </div>

          {logoOption === 'upload' ? (
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer ${
                dragActive 
                  ? 'border-[#0f4c81] bg-blue-50/40 scale-[1.01]' 
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
              }`}
              onClick={() => document.getElementById('logoFileInput')?.click()}
            >
              <input 
                id="logoFileInput"
                type="file" 
                accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                onChange={handleFileChange}
                className="hidden" 
              />
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0f4c81]">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-700">Cliquez pour choisir votre logo ou Glissez-déposez</p>
              <p className="text-[10px] text-slate-400 font-medium">PNG, JPG, JPEG ou SVG (Le fichier sera encodé en dur)</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Adresse URL de votre logo</label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  placeholder="https://mon-site.fr/images/mon-logo.png"
                  value={logoUrl}
                  onChange={(e) => handleUrlInputChange(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-[#0f4c81]"
                />
                <button
                  type="button"
                  onClick={handleUrlSubmit}
                  disabled={hasPreviewError && logoUrl !== ''}
                  className="bg-[#0f4c81] hover:bg-[#1a5b94] disabled:bg-slate-300 text-white font-bold text-xs px-4 rounded-lg transition-all"
                >
                  Valider
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Saisissez un lien direct d'image. Les liens de partage <strong>Google Drive</strong> et <strong>Dropbox</strong> sont détectés et convertis automatiquement en liens directs d'affichage pour éviter les erreurs !
              </p>
            </div>
          )}

          {/* 3. RESET TO DEFAULT */}
          <div className="flex justify-between items-center pt-3 border-t border-slate-150 mt-4">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurer le logo par défaut
            </button>

            {saveStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 animate-fade-in">
                <Check className="w-4 h-4" /> Logo enregistré !
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs font-bold text-red-600 animate-fade-in">
                <AlertCircle className="w-4 h-4" /> Erreur d'enregistrement
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. MANUAL TECHNICAL INSTRUCTION ACCORDION FOR WORKSPACE REPLACEMENT */}
      <div className="bg-blue-50/50 border border-blue-200/60 rounded-2xl p-5">
        <h4 className="font-bold text-[#0f4c81] text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <FileText className="w-4 h-4" /> Option 3: Remplacement physique direct du fichier
        </h4>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
          Si vous souhaitez remplacer le logo physiquement dans le projet pour qu'il soit affiché par défaut pour tous sans utiliser le stockage local, suivez ces étapes simples :
        </p>
        <ol className="text-[11px] text-slate-500 list-decimal pl-4 space-y-1.5 leading-relaxed">
          <li>
            Renommez votre propre image de logo avec le nom exact : 
            <strong className="text-slate-800 font-mono block mt-0.5 bg-white py-1 px-1.5 rounded border border-slate-200 select-all">Logo fudep transparent.png</strong>
          </li>
          <li>
            Dans l'explorateur de fichiers d'AI Studio à gauche, allez dans le dossier <strong className="text-slate-700">public/</strong>.
          </li>
          <li>
            Glissez-déposez ou uploadez directement votre fichier renommé pour écraser le fichier existant.
          </li>
          <li>
            L'application sera reconstruite automatiquement avec votre logo officiel personnalisé en dur !
          </li>
        </ol>
      </div>
    </div>
  );
}
