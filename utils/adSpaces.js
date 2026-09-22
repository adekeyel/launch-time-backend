const DURATIONS = [1, 3, 7, 30];

const AD_SPACES = {
  hero: {
    key: 'hero',
    label: 'Homepage banner',
    description: 'The big rotating banner at the top of the home page.',
    width: 1200,
    height: 600,
    minWidth: 800,
    tolerance: 0.12,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'],
    maxMb: 15,
    note: 'Images, GIFs, or video up to 30 seconds.',
  },
  tile: {
    key: 'tile',
    label: 'Homepage tile',
    description: 'One of the small squares beside the banner on the home page.',
    width: 600,
    height: 600,
    minWidth: 400,
    tolerance: 0.12,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxMb: 5,
    note: 'Still images only.',
  },
  top: {
    key: 'top',
    label: 'Top strip',
    description: 'A thin strip above the header on browse pages.',
    width: 1600,
    height: 50,
    minWidth: 800,
    tolerance: 0.3,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxMb: 3,
    note: 'Images and GIFs.',
  },
  middle: {
    key: 'middle',
    label: 'Middle strip',
    description: 'A banner strip further down browse pages.',
    width: 1600,
    height: 100,
    minWidth: 800,
    tolerance: 0.3,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxMb: 3,
    note: 'Images and GIFs.',
  },
  bottom: {
    key: 'bottom',
    label: 'Bottom strip',
    description: 'A thin strip just above the footer on browse pages.',
    width: 1600,
    height: 50,
    minWidth: 800,
    tolerance: 0.3,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxMb: 3,
    note: 'Images and GIFs.',
  },
};

const PLACEMENT_KEYS = Object.keys(AD_SPACES);
const priceKey = (placement, days) => `campaign_price_${placement}_${days}day`;
const mediaKind = (mime) => (mime.startsWith('video/') ? 'video' : 'image');

module.exports = { AD_SPACES, DURATIONS, PLACEMENT_KEYS, priceKey, mediaKind };
