import React, { useState } from 'react';
import axios from 'axios';

// Backend API URL
const API = 'http://localhost:4000';

// =============================================
// HELPER FUNCTIONS for Formatting Data (Unchanged)
// =============================================
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const parts = [h, m, s].map(v => v.toString().padStart(2, '0'));
  
  if (h === 0) {
      return parts.slice(1).join(':');
  }
  return parts.join(':');
}

function formatNumber(num) {
  if (num === undefined || num === null || num === 0) return 'N/A';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

// =============================================
// METADATA DISPLAY COMPONENT (Compact & Responsive)
// =============================================
const VideoMetadata = ({ info }) => {
    if (!info) return null; 

    const metadataItems = [
        { label: 'Channel', value: info.channel || 'N/A', icon: 'fa-user-circle' },
        { label: 'Views', value: formatNumber(info.views), icon: 'fa-eye' },
        { label: 'Likes', value: formatNumber(info.likes), icon: 'fa-thumbs-up' },
        { label: 'Duration', value: formatDuration(info.duration), icon: 'fa-clock' },
        { label: 'Published', value: info.uploadDate ? new Date(info.uploadDate).toLocaleDateString() : 'N/A', icon: 'fa-calendar-alt' },
    ].filter(item => item.value !== 'N/A');

    return (
        // Adjusted padding for mobile (p-3) and background/border for a cleaner look
        <div className="p-3 sm:p-4 bg-white rounded-xl shadow-lg border border-orange-200 mb-5 animate-fadeIn">
            
            {/* Title Block - Clearer header */}
            <h5 className="font-extrabold text-sm sm:text-base text-gray-800 mb-3 border-b-2 border-orange-300 pb-2 flex items-center">
                <i className={`fas ${info.isYouTube ? 'fa-video text-red-600' : 'fa-camera text-pink-600'} mr-2 text-base sm:text-lg`}></i>
                {info.isYouTube ? 'YouTube Video Details' : 'Instagram Media Details'}
            </h5>
            
            {/* Responsive Grid for Thumbnail and Data */}
            <div className={`grid ${info.thumbnail ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'} gap-4 items-center`}>
                
                {/* Thumbnail Column (Mobile-friendly width) */}
                {info.thumbnail && (
                    <div className="flex justify-center md:col-span-1">
                        <img 
                            src={info.thumbnail} 
                            alt="Media Thumbnail" 
                            // Adjusted max-width for better mobile fit
                            className="w-full max-w-xs aspect-video object-cover rounded-lg shadow-xl border-2 border-orange-400 transition-transform duration-300 hover:scale-[1.05]"
                        />
                    </div>
                )}

                {/* Data Column (Uses xs/sm text sizes for compactness) */}
                <div className={`space-y-2 ${info.thumbnail ? 'md:col-span-2' : 'md:col-span-3'}`}>
                    {metadataItems.map((item, index) => (
                        // Increased space-y from 1 to 2
                        <div key={index} className="flex items-start text-xs sm:text-sm border-b border-orange-100 pb-1">
                            {/* Icon - Extra small size */}
                            <i className={`fas ${item.icon} text-orange-500 mr-3 mt-[2px] text-xs sm:text-sm w-3.5 text-center`}></i>
                            
                            <div className="flex justify-between w-full">
                                {/* Label - Compact and small */}
                                <span className="font-semibold text-gray-600 w-24 min-w-max mr-4">{item.label}:</span>
                                {/* Value - Bold and small */}
                                <span className="font-bold text-gray-900 break-words flex-1 text-right">{item.value}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// =============================================
// MAIN APP COMPONENT (Fixed Loading, Orange Theme, Bubbles)
// =============================================
export default function App() {
  const [url, setUrl] = useState(''); 
  const [videoInfo, setVideoInfo] = useState(null); 
  const [itag, setItag] = useState('');
  const [loadingYoutube, setLoadingYoutube] = useState(false);
  const [loadingInstagram, setLoadingInstagram] = useState(false);
  const [msg, setMsg] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [downloadType, setDownloadType] = useState('video'); 

  const isLoading = loadingYoutube || loadingInstagram;

  const isYouTube = url.includes('youtu.be') || url.includes('youtube.com');
  const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');


  // ---------------------------------------------
  // 1. YouTube Formats (get-video-info)
  // ---------------------------------------------
  const getFormats = async () => {
        if (isLoading || !url) return;
        if (!isYouTube) {
            setMsg('Please enter a valid YouTube URL to check formats.');
            return;
        }

        setLoadingYoutube(true); 
        setMsg(''); setVideoInfo(null); setSelectedQuality('');
        
        try {
            const res = await axios.get(`${API}/get-video-info`, { params: { url } });
            setVideoInfo({...res.data, isYouTube: true});
            
            const initialFormat = res.data.formats.find(f => !f.isAudioOnly) || res.data.formats[0];
            if (initialFormat) {
                setItag(initialFormat.itag);
                setSelectedQuality(initialFormat.quality);
                setDownloadType(initialFormat.isAudioOnly ? 'audio' : 'video');
            }
        } catch (e) {
            setMsg(e.response?.data?.error || 'Error fetching YouTube info. Check URL or try later.');
        } finally {
            setLoadingYoutube(false);
        }
  };

  // ---------------------------------------------
  // 2. Instagram Formats (get-insta-info)
  // ---------------------------------------------
  const getInstaFormats = async () => {
        if (isLoading || !url) return;
        if (!isInstagram) {
            setMsg('Please enter a valid Instagram URL to check info.');
            return;
        }

        setLoadingInstagram(true);
        setMsg(''); setVideoInfo(null); setSelectedQuality('');
        
        try {
            const res = await axios.get(`${API}/get-insta-info`, { params: { url } });
            setVideoInfo({...res.data, isYouTube: false});
            
            const initialFormat = res.data.formats[0];
            if (initialFormat) {
                setItag(initialFormat.itag);
                setSelectedQuality(initialFormat.quality);
                setDownloadType('insta'); 
            }
        } catch (e) {
            setMsg(e.response?.data?.error || 'Error fetching Instagram info. Post might be private or URL is invalid.');
        } finally {
            setLoadingInstagram(false);
        }
  };

  // ---------------------------------------------
  // 3. Unified Download Handler
  // ---------------------------------------------
  const downloadMedia = () => {
        if (!itag || isLoading) {
            setMsg('Please select a format and try again.');
            return;
        }

        const cleanFilename = videoInfo.title.replace(/[^a-z0-9_.-]/gi, '_'); 
        let downloadUrl;
        if (downloadType === 'insta') {
            downloadUrl = `${API}/download-instagram-stream?url=${encodeURIComponent(url)}&itag=${itag}&filename=${cleanFilename}`;
        } else {
            downloadUrl = `${API}/download-youtube-stream?url=${encodeURIComponent(url)}&itag=${itag}&type=${downloadType}&filename=${cleanFilename}&quality=${selectedQuality}`;
        }
    
        window.location.href = downloadUrl;
        setMsg(`Download of "${videoInfo.title}" started. Please wait...`);
  };
  
  // ---------------------------------------------
  // 4. Format Change Handler
  // ---------------------------------------------
  const handleFormatChange = (f) => {
    setItag(f.itag);
    setSelectedQuality(f.quality);
    
    if (videoInfo.isYouTube) {
      setDownloadType(f.isAudioOnly ? 'audio' : 'video');
    } else {
      setDownloadType('insta');
    }
  };


  return (
    // Main Container: Dynamic Gradient Background with Animated Bubbles
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-orange-100 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden">
        
        {/* Animated Background Bubbles (Assuming 'animate-bubble' is defined in tailwind.config.js) */}
        {/* NOTE: You must define 'animate-bubble' and 'animate-fadeIn' in your tailwind.config.js for these to work. */}
        {/* Example tailwind.config.js setup:
          theme: {
            extend: {
              keyframes: {
                bubble: {
                  '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
                  '25%': { transform: 'translate(20px, -30px) scale(1.1)' },
                  '50%': { transform: 'translate(-20px, 40px) scale(0.95)' },
                  '75%': { transform: 'translate(30px, 10px) scale(1.05)' },
                },
                fadeIn: {
                  '0%': { opacity: 0, transform: 'translateY(10px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' },
                }
              },
              animation: {
                bubble: 'bubble 15s ease-in-out infinite alternate',
                fadeIn: 'fadeIn 0.5s ease-out forwards',
              }
            },
          },
        */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-50">
            {/* Bubble 1: Animated */}
            <div className="absolute h-40 w-40 bg-orange-200 rounded-full animate-bubble blur-md" style={{top: '10%', left: '5%', animationDelay: '0s'}}></div>
            {/* Bubble 2: Animated */}
            <div className="absolute h-60 w-60 bg-red-200 rounded-full animate-bubble blur-md" style={{top: '50%', right: '15%', animationDelay: '5s'}}></div>
            {/* Bubble 3: Animated */}
            <div className="absolute h-52 w-52 bg-yellow-200 rounded-full animate-bubble blur-md" style={{bottom: '5%', left: '25%', animationDelay: '10s'}}></div>
        </div>

      {/* Card/App Wrapper: Floating, large shadow, with entry animation */}
      <div className="w-full max-w-4xl bg-white p-6 sm:p-10 rounded-3xl shadow-2xl shadow-orange-300/80 border-4 border-orange-200 relative z-10 transition-all duration-500 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
        
        {/* Header - Increased size and border */}
        <h2 className="text-2xl sm:text-5xl font-black text-orange-700 text-center mb-6 pb-4 border-b-4 border-orange-500/70">
          <i className="fas fa-satellite-dish text-xl sm:text-4xl mr-3 text-red-600"></i> 
          Pro Media Downloader
        </h2>

        <div className="space-y-4 sm:space-y-6">
          {/* URL Input */}
          <div className="relative">
                <i className="fas fa-link absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg"></i>
              <input
                value={url}
                onChange={e => {
                    setUrl(e.target.value);
                    setVideoInfo(null); 
                    setMsg('');
                }}
                placeholder="Paste YouTube or Instagram URL here..."
                // Increased padding and text size for better mobile input
                className="w-full p-4 pl-2 border-3 border-gray-300 rounded-xl focus:ring-orange-500 focus:border-orange-500 text-base shadow-inner transition-colors bg-white font-medium"
              />
          </div>

          {/* Button Group - Responsive and clearer text */}
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
            
            {/* YouTube Info Button - Better hover/active effects */}
            <button 
              onClick={getFormats}
              disabled={isLoading || !isYouTube}
              className="flex-1 p-3.5 bg-red-600 text-white font-extrabold rounded-xl shadow-lg shadow-red-400/50 hover:bg-red-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg transform active:scale-[0.98] flex justify-center items-center"
            >
                {loadingYoutube ? (
                    <>
                        <i className="fas fa-spinner fa-spin mr-2"></i> Fetching...
                    </>
                ) : (
                    <>
                        <i className="fab fa-youtube mr-2 text-xl"></i> Get YouTube Data
                    </>
                )}
            </button>
            
            {/* Instagram Info Button - Better hover/active effects */}
            <button 
              onClick={getInstaFormats}
              disabled={isLoading || !isInstagram}
              className="flex-1 p-3.5 bg-pink-600 text-white font-extrabold rounded-xl shadow-lg shadow-pink-400/50 hover:bg-pink-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg transform active:scale-[0.98] flex justify-center items-center"
            >
                {loadingInstagram ? (
                    <>
                        <i className="fas fa-spinner fa-spin mr-2"></i> Fetching...
                    </>
                ) : (
                    <>
                        <i className="fab fa-instagram mr-2 text-xl"></i> Get Instagram Data
                    </>
                )}
            </button>
          </div>
        </div>

        {/* Video/Media Information Section - Added entry animation */}
        {videoInfo && (
          <div className="mt-8 p-4 sm:p-6 bg-orange-50 border-4 border-orange-400/30 rounded-2xl shadow-xl animate-fadeIn" style={{ animationDelay: '0.4s' }}>

            {/* 1. Video Metadata (Updated to be compact/responsive) */}
            <VideoMetadata info={videoInfo} />
          
            {/* 2. Title & Original URL Link - Clearer presentation */}
            <div className="mb-4 border-b pb-3 border-orange-300">
                <i className="fas fa-heading text-orange-600 mr-2 text-xl"></i>
               <h4 className="block text-xl sm:text-2xl font-black text-gray-900 mb-1 break-words whitespace-normal">
  {videoInfo.title}
</h4>

                <a 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  // Increased text size slightly
                  className="text-sm text-orange-600 hover:text-orange-800 underline font-semibold block truncate mt-1"
                >
                  <i className="fas fa-external-link-alt mr-1 text-xs"></i> View Original Source
                </a>
            </div>
            
            {/* Selected Format & Instructions - More prominent */}
            <div className="p-3 bg-orange-200/50 rounded-lg mb-4 border border-orange-400 shadow-inner">
                <p className="text-sm sm:text-base font-bold text-gray-800 flex items-center">
                    <i className="fas fa-cogs text-orange-700 mr-2 text-lg"></i>
                  Selected Format: 
                  <span className={`font-black ml-2 text-base sm:text-lg ${downloadType === 'audio' ? 'text-green-700' : 'text-orange-800'}`}>
                    {selectedQuality} ({downloadType === 'audio' ? 'MP3 Audio' : (downloadType === 'insta' ? 'Instagram Media' : 'Video/MP4')})
                  </span>
                </p>
            </div>


            {/* Format List - Compact and scrollable list */}
            <div className="max-h-80 overflow-y-auto pr-3 space-y-2 p-2 rounded-xl bg-white shadow-inner border border-gray-200">
                <p className="text-sm font-black text-gray-600 sticky top-0 bg-white p-2 border-b-2 border-orange-100/70">
                    <i className="fas fa-list-ul mr-2 text-orange-500"></i> **Choose Quality:**
                </p>
              {videoInfo.formats.map(f => {
                const isAudioOnly = f.isAudioOnly;
                const isSelected = itag === f.itag;
                
                return (
                  <div 
                    key={f.itag} 
                    // Adjusted selected and hover styles
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      isSelected 
                        ? 'bg-orange-200/70 border-orange-600 shadow-lg' 
                        : 'border-gray-100 hover:bg-orange-50'
                    }`}
                    onClick={() => handleFormatChange(f)}
                  >
                    {/* Custom Radio Button */}
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors mr-3 ${isSelected ? 'border-orange-600 bg-white' : 'border-gray-400 bg-gray-100'}`}>
                        {isSelected && <div className="h-2.5 w-2.5 bg-orange-600 rounded-full shadow-inner"></div>}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between w-full text-sm sm:text-base">
                        {/* Icon for Media Type and Quality - Bolder text */}
                        <div className="flex items-center">
                            <i className={`fas mr-3 text-lg ${isAudioOnly ? 'fa-music text-green-600' : 'fa-film text-orange-600'}`}></i>
                            <span className={`font-black ${isAudioOnly ? 'text-green-800' : 'text-gray-900'}`}>
                                {f.quality} 
                          </span>
                        </div>
                        
                        {/* Type and Size */}
                        <span className="text-gray-500 sm:text-right font-medium mt-0.5 sm:mt-0">
                            ({isAudioOnly ? 'Audio' : f.container?.toUpperCase() || 'VIDEO'})
                            <span className="ml-3 font-mono text-gray-900 font-bold bg-gray-200 px-2 py-0.5 rounded-full text-xs sm:text-sm">{f.size}</span>
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unified Download Button - More emphasis on click effect */}
            <button 
              onClick={downloadMedia}
              disabled={isLoading || !itag}
              className="mt-6 w-full p-4 text-xl font-black bg-orange-600 text-white rounded-xl shadow-2xl shadow-orange-400/70 hover:bg-orange-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.005] active:scale-[0.99]"
            >
              <i className="fas fa-cloud-download-alt mr-2"></i> 
              DOWNLOAD {selectedQuality}
            </button>
          </div>
        )}

        {/* Global Status Messages (Clearer colors and icons) */}
        {msg && <p className={`mt-5 text-center font-bold p-3 rounded-xl border-2 shadow-lg text-sm sm:text-base ${msg.includes('Error') || msg.includes('invalid') ? 'text-red-700 bg-red-100 border-red-300' : 'text-green-700 bg-green-100 border-green-300'}`}>
            {msg.includes('Error') || msg.includes('invalid') ? <i className="fas fa-exclamation-triangle mr-2"></i> : <i className="fas fa-info-circle mr-2"></i>}
            {msg}
        </p>}
      </div>
    </div>
  );
}