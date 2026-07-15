import React, { useState, useEffect } from 'react';
import { Upload, Settings, RotateCcw, Check, Image, AlertCircle, FileText } from 'lucide-react';

export function AdminSettingsTab() {
  const [logoOption, setLogoOption] = useState<'upload' | 'url'>('upload');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('/fudep_puzzle_logo_1783249722185.jpg');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dragActive, setDragActive] = useState<boolean>(false);

  useEffect(() => {
    const savedLogo = localStorage.getItem('fudep_custom_logo');
    if (savedLogo) {
      setPreviewUrl(savedLogo);
      if (savedLogo.startsWith('http')) {
        setLogoUrl(savedLogo);
        setLogoOption('url');
      }
    }
  }, []);

  const handleLogoSave = (urlToSave: string) => {
    try {
      if (!urlToSave) {
        localStorage.removeItem('fudep_custom_logo');
      } else {
        localStorage.setItem('fudep_custom_logo', urlToSave);
      }
      
      // Dispatch custom event to notify all FudepLogo components
      window.dispatchEvent(new Event('fudep_logo_updated'));
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPreviewUrl(base64String);
      handleLogoSave(base64String);
    };
    reader.readAsDataURL(file);
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

  const handleReset = () => {
    if (window.confirm("Voulez-vous restaurer le logo officiel de Fudep par défaut ?")) {
      localStorage.removeItem('fudep_custom_logo');
      setPreviewUrl('/fudep_puzzle_logo_1783249722185.jpg');
      setLogoUrl('');
      window.dispatchEvent(new Event('fudep_logo_updated'));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in text-slate-800 pb-10">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-3">
          <Settings className="w-5 h-5 text-[#0f4c81]" />
          <div>
            <h3 className="font-serif font-bold text-slate-800 text-base">Personnalisation de la Marque</h3>
            <p className="text-[11px] text-slate-400">Configurez l'identité visuelle de votre marketplace Fudep</p>
          </div>
        </div>

        {/* 1. LOGO PREVIEW CONTAINER */}
        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100 mb-5 text-center">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-3">Aperçu en temps réel</span>
          <div className="w-24 h-24 bg-white rounded-2xl shadow-md border border-slate-200/60 flex items-center justify-center p-3 transition-transform hover:scale-105 duration-300">
            <img 
              src={previewUrl} 
              alt="Fudep Logo Preview" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // fallback if broken URL is entered
                (e.target as HTMLImageElement).src = '/fudep_puzzle_logo_1783249722185.jpg';
              }}
            />
          </div>
          <span className="text-xs font-bold text-[#0f4c81] mt-3">Fudep Nails Marketplace</span>
          <p className="text-[10px] text-slate-400 max-w-[240px] mt-1 leading-normal">
            Ce logo s'affiche instantanément dans l'en-tête de l'application et les zones partenaires de la plateforme.
          </p>
        </div>

        {/* 2. LOGO CONFIGURATION OPTIONS */}
        <div className="space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs gap-1">
            <button
              type="button"
              onClick={() => setLogoOption('upload')}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${logoOption === 'upload' ? 'bg-white text-[#0f4c81] shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Upload className="w-3.5 h-3.5" />
              Importer un fichier
            </button>
            <button
              type="button"
              onClick={() => setLogoOption('url')}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${logoOption === 'url' ? 'bg-white text-[#0f4c81] shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Image className="w-3.5 h-3.5" />
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
              <p className="text-xs font-bold text-slate-700">Cliquez pour choisir un fichier ou Glissez-déposez</p>
              <p className="text-[10px] text-slate-400">PNG, JPG, JPEG ou SVG (Format carré recommandé)</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Adresse URL de votre logo</label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  placeholder="https://mon-site.fr/images/mon-logo.png"
                  value={logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    if (e.target.value) {
                      setPreviewUrl(e.target.value);
                    }
                  }}
                  className="flex-1 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-[#0f4c81]"
                />
                <button
                  type="button"
                  onClick={() => handleLogoSave(logoUrl)}
                  className="bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold text-xs px-4 rounded-lg transition-all"
                >
                  Valider
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Collez l'adresse web directe d'une image hébergée sur internet.
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
                <Check className="w-4 h-4" /> Enregistré !
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
          <FileText className="w-4 h-4" /> Remplacement Manuel via l'Explorateur
        </h4>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
          Si vous préférez écraser définitivement le fichier physique du logo par défaut dans le projet, vous pouvez le faire directement depuis votre espace de travail :
        </p>
        <ol className="text-[11px] text-slate-500 list-decimal pl-4 space-y-1.5 leading-relaxed">
          <li>
            Renommez votre propre image de logo avec le nom exact : 
            <strong className="text-slate-800 font-mono block mt-0.5 bg-white py-1 px-1.5 rounded border border-slate-200 select-all">fudep_puzzle_logo_1783249722185.jpg</strong>
          </li>
          <li>
            Dans l'explorateur de fichiers d'AI Studio à gauche, allez dans le dossier <strong className="text-slate-700">public/</strong> ou <strong className="text-slate-700">src/assets/images/</strong>.
          </li>
          <li>
            Glissez-déposez ou uploadez directement votre fichier renommé pour écraser le fichier existant.
          </li>
          <li>
            L'application se reconstruira instantanément avec votre nouveau logo officiel en dur !
          </li>
        </ol>
      </div>
    </div>
  );
}
