// api/index.js
import ytdl from 'ytdl-core';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Only GET and POST methods are supported'
    });
  }

  try {
    const { url, quality, format, action } = req.method === 'GET' ? req.query : req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing URL',
        message: 'Please provide a YouTube URL'
      });
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        message: 'Please provide a valid YouTube URL'
      });
    }

    const videoId = ytdl.getVideoID(url);

    // If action is 'info', return video information only
    if (action === 'info') {
      const info = await ytdl.getInfo(url);
      const videoDetails = info.videoDetails;
      
      // Get available formats
      const formats = info.formats
        .filter(format => format.hasVideo && format.hasAudio)
        .map(format => ({
          itag: format.itag,
          quality: format.qualityLabel || format.quality,
          container: format.container,
          codecs: format.codecs,
          bitrate: format.bitrate,
          fps: format.fps,
          filesize: format.contentLength ? parseInt(format.contentLength) : null,
          filesizeReadable: format.contentLength ? formatBytes(parseInt(format.contentLength)) : 'Unknown'
        }))
        .sort((a, b) => {
          const qualityOrder = { '144p': 1, '240p': 2, '360p': 3, '480p': 4, '720p': 5, '1080p': 6, '1440p': 7, '2160p': 8 };
          return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        });

      // Get audio-only formats
      const audioFormats = info.formats
        .filter(format => format.hasAudio && !format.hasVideo)
        .map(format => ({
          itag: format.itag,
          quality: format.audioBitrate ? `${format.audioBitrate}kbps` : 'Unknown',
          container: format.container,
          codecs: format.codecs,
          bitrate: format.audioBitrate,
          filesize: format.contentLength ? parseInt(format.contentLength) : null,
          filesizeReadable: format.contentLength ? formatBytes(parseInt(format.contentLength)) : 'Unknown'
        }))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      return res.status(200).json({
        success: true,
        data: {
          videoDetails: {
            videoId: videoDetails.videoId,
            title: videoDetails.title,
            description: videoDetails.description,
            lengthSeconds: videoDetails.lengthSeconds,
            duration: formatDuration(videoDetails.lengthSeconds),
            keywords: videoDetails.keywords,
            channelId: videoDetails.channelId,
            channelName: videoDetails.author.name,
            channelUrl: videoDetails.author.channel_url,
            subscriberCount: videoDetails.author.subscriber_count,
            viewCount: videoDetails.viewCount,
            publishDate: videoDetails.publishDate,
            uploadDate: videoDetails.uploadDate,
            category: videoDetails.category,
            isLiveContent: videoDetails.isLiveContent,
            thumbnails: {
              default: videoDetails.thumbnails[0]?.url,
              medium: videoDetails.thumbnails[1]?.url,
              high: videoDetails.thumbnails[2]?.url,
              maxres: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url
            },
            rating: {
              likes: videoDetails.likes,
              dislikes: videoDetails.dislikes
            }
          },
          availableFormats: {
            video: formats,
            audio: audioFormats
          },
          downloadUrls: {
            video: formats.map(f => ({
              quality: f.quality,
              url: `${req.headers.host}/api/download?url=${encodeURIComponent(url)}&quality=${f.quality}&format=video`
            })),
            audio: audioFormats.map(f => ({
              quality: f.quality,
              url: `${req.headers.host}/api/download?url=${encodeURIComponent(url)}&quality=${f.quality}&format=audio`
            }))
          }
        }
      });
    }

    // Handle download request
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;

    let selectedFormat;
    
    if (format === 'audio') {
      // Get audio format
      selectedFormat = ytdl.chooseFormat(info.formats, {
        quality: 'highestaudio',
        filter: 'audioonly'
      });
    } else {
      // Get video format
      if (quality) {
        // Try to find format with specific quality
        selectedFormat = info.formats.find(f => 
          f.qualityLabel === quality && f.hasVideo && f.hasAudio
        );
        
        if (!selectedFormat) {
          // Fallback to best format with video and audio
          selectedFormat = ytdl.chooseFormat(info.formats, {
            quality: 'highest',
            filter: 'videoandaudio'
          });
        }
      } else {
        // Default to highest quality
        selectedFormat = ytdl.chooseFormat(info.formats, {
          quality: 'highest',
          filter: 'videoandaudio'
        });
      }
    }

    if (!selectedFormat) {
      return res.status(404).json({
        success: false,
        error: 'Format not found',
        message: 'Requested quality/format not available'
      });
    }

    // Set appropriate headers for download
    const extension = selectedFormat.container || 'mp4';
    const filename = `${videoDetails.title.replace(/[^\w\s]/gi, '').substring(0, 50)}.${extension}`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', selectedFormat.mimeType || 'video/mp4');
    
    if (selectedFormat.contentLength) {
      res.setHeader('Content-Length', selectedFormat.contentLength);
    }

    // Stream the video
    const stream = ytdl(url, {
      format: selectedFormat,
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    });

    stream.pipe(res);

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Stream error',
          message: error.message
        });
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to format duration
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
