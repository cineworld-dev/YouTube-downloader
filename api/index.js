import ytdl from 'ytdl-core';

export default async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  try {
    const info = await ytdl.getInfo(url);

    const formats = info.formats
      .filter(f => f.hasVideo || f.hasAudio)
      .map(f => ({
        quality: f.qualityLabel || 'Audio only',
        type: `${f.hasVideo ? 'video' : ''}${f.hasAudio ? '+audio' : ''}`,
        mimeType: f.mimeType?.split(';')[0] || '',
        size: f.contentLength ? `${(f.contentLength / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
        url: f.url
      }));

    const data = {
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      duration: `${Math.floor(info.videoDetails.lengthSeconds / 60)}:${info.videoDetails.lengthSeconds % 60}`.padStart(2, '0'),
      thumbnail: info.videoDetails.thumbnails.pop().url,
      formats
    };

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch video details' });
  }
}
