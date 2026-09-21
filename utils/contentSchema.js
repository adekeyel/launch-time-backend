const { ApiError } = require('./response');

// ---------------------------------------------------------------------------
// Site content (CMS)
//
// Every editable part of the public website is described here ONCE: what its
// fields are, what they're called in the admin screen, their limits, and their
// default values (which are exactly what the site showed before it was
// editable). This one description drives three things:
//   - the admin form (the frontend renders it),
//   - server-side validation (nothing unchecked reaches the database),
//   - the effective content the website reads (defaults + whatever an admin
//     has saved, so a brand-new field or section always has a sensible value).
//
// Text may contain {siteName} and {year}; the website fills them in.
// ---------------------------------------------------------------------------

const AUDIENCES = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'guests', label: 'Visitors who are not signed in' },
  { value: 'customers', label: 'Signed-in customers' },
  { value: 'guests_customers', label: 'Visitors and customers (not vendors or admins)' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'admins', label: 'Admins' },
];

const SLIDE_TONES = [
  { value: 'forest', label: 'Dark green' },
  { value: 'marigold', label: 'Orange' },
  { value: 'basil', label: 'Green' },
];

const TILE_TONES = [...SLIDE_TONES, { value: 'paper', label: 'White' }];

const HEADER_TONES = [
  { value: 'marigold', label: 'Orange (default)' },
  { value: 'white', label: 'White' },
  { value: 'ink', label: 'Dark green' },
  { value: 'basil', label: 'Green' },
];

// ---- field builders --------------------------------------------------------
const text = (label, def, o = {}) => ({ type: 'text', label, default: def, max: 120, ...o });
const area = (label, def, o = {}) => ({ type: 'textarea', label, default: def, max: 500, rows: 3, ...o });
const link = (label, def, o = {}) => ({ type: 'link', label, default: def, ...o });
const toggle = (label, def, o = {}) => ({ type: 'boolean', label, default: def, ...o });
const number = (label, def, o = {}) => ({ type: 'number', label, default: def, integer: true, ...o });
const select = (label, def, options, o = {}) => ({ type: 'select', label, default: def, options, ...o });
const image = (label, o = {}) => ({ type: 'image', label, default: null, ...o });
const group = (label, fields, o = {}) => ({ type: 'group', label, fields, ...o });
const list = (label, itemLabel, fields, defaults, o = {}) => ({
  type: 'list',
  label,
  itemLabel,
  fields,
  default: defaults,
  max: 10,
  ...o,
});

const audience = (def = 'everyone') =>
  select('Show to', def, AUDIENCES, { help: 'Who gets to see this.' });

// ---- the sections ------------------------------------------------------------
const SECTIONS = [
  {
    key: 'brand',
    label: 'Brand and logo',
    description: 'The site name, tagline, logos and the colour of the top bar.',
    previewPath: '/',
    fields: {
      siteName: text('Site name', 'LAUNCH TIME', { max: 40, required: true, help: 'Used in the header, page titles, emails and footer.' }),
      tagline: text('Tagline', 'Good food. Right time.', { max: 80 }),
      logoIcon: image('Header logo (square)', { help: 'A square logo for the top bar. Leave empty to use the built-in logo.' }),
      logoFull: image('Footer logo (wide)', { help: 'The full logo shown in the footer. Leave empty to use the built-in logo.' }),
      headerTone: select('Top bar colour', 'marigold', HEADER_TONES),
    },
  },
  {
    key: 'header',
    label: 'Header and menus',
    description: 'The search box, the Help menu, and the links in the top bar.',
    previewPath: '/',
    fields: {
      searchPlaceholder: text('Search box hint', 'Search for meals, kitchens, cuisines', { max: 80 }),
      showSellLink: toggle('Show the "sell" link (for visitors)', true),
      sellLinkLabel: text('"Sell" link text', 'Sell on {siteName}', { max: 40 }),
      sellLinkTarget: link('"Sell" link goes to', '/register', { required: true }),
      showOpenNowLink: toggle('Show the "Open now" link in the category bar', true),
      openNowLabel: text('"Open now" link text', 'Open now', { max: 30 }),
      showHelpMenu: toggle('Show the Help menu', true),
      helpLabel: text('Help menu title', 'Help', { max: 20 }),
      helpLinks: list(
        'Help menu links',
        'Link',
        {
          label: text('Text', '', { max: 40, required: true }),
          link: link('Goes to', '', { required: true }),
        },
        [
          { label: 'About {siteName}', link: '/about' },
          { label: 'Meet the founder', link: '/founder' },
          { label: 'Terms of service', link: '/terms' },
          { label: 'Privacy policy', link: '/privacy' },
        ],
        { max: 8, itemTitle: 'label' }
      ),
    },
  },
  {
    key: 'home_hero',
    label: 'Home page: banner',
    description:
      'The big rotating banner at the top of the home page. Advertisers\' banners (Ads) come first; these slides fill in around them.',
    previewPath: '/',
    fields: {
      minSlides: number('Show our own slides until the banner has at least this many', 3, {
        min: 1,
        max: 6,
        help: 'Paid ads always come first. Our own slides only fill the gaps.',
      }),
      autoplay: toggle('Slide automatically', true),
      intervalSeconds: number('Seconds per slide', 6, { min: 3, max: 20 }),
      slides: list(
        'Our own slides',
        'Slide',
        {
          enabled: toggle('Show this slide', true),
          audience: audience(),
          tone: select('Colour', 'forest', SLIDE_TONES),
          eyebrow: text('Small heading (hidden on phones)', '', { max: 40 }),
          title: text('Headline', '', { max: 90, required: true }),
          body: area('Text (hidden on phones)', '', { max: 220, rows: 2 }),
          ctaLabel: text('Button text', '', { max: 30 }),
          ctaLink: link('Button goes to', ''),
          showBadge: toggle('Show the logo badge', false),
        },
        [
          {
            enabled: true,
            audience: 'everyone',
            tone: 'forest',
            eyebrow: 'Local kitchens, delivered',
            title: 'Your local kitchens, plated and delivered.',
            body: 'Browse verified vendors, see the delivery fee before you order, and follow your order to your door.',
            ctaLabel: 'Browse kitchens',
            ctaLink: '/vendors',
            showBadge: true,
          },
          {
            enabled: true,
            audience: 'everyone',
            tone: 'marigold',
            eyebrow: 'Open right now',
            title: "See who's cooking tonight.",
            body: "Kitchens show when they're open, so you never order from a kitchen that has closed for the day.",
            ctaLabel: 'See open kitchens',
            ctaLink: '/vendors?open=1',
            showBadge: false,
          },
          {
            enabled: true,
            audience: 'guests_customers',
            tone: 'basil',
            eyebrow: 'For vendors',
            title: 'Own a kitchen? Sell on {siteName}.',
            body: 'Set your menu, opening hours and delivery fee, and start taking orders from customers around you.',
            ctaLabel: 'Open your kitchen',
            ctaLink: '/register',
            showBadge: false,
          },
          {
            enabled: true,
            audience: 'vendors',
            tone: 'basil',
            eyebrow: 'For vendors',
            title: 'Your kitchen, your rules.',
            body: 'Manage your menu, opening hours, delivery fee and orders from your dashboard.',
            ctaLabel: 'Go to your dashboard',
            ctaLink: '/vendor/dashboard',
            showBadge: false,
          },
        ],
        { max: 8, itemTitle: 'title' }
      ),
    },
  },
  {
    key: 'home_tiles',
    label: 'Home page: promo tiles',
    description:
      'The small squares beside the banner. Advertisers\' tiles (Ads) take the first squares; the first four of these that apply to the visitor fill the rest.',
    previewPath: '/',
    fields: {
      tiles: list(
        'Our own tiles',
        'Tile',
        {
          enabled: toggle('Show this tile', true),
          audience: audience(),
          tone: select('Colour', 'paper', TILE_TONES),
          title: text('Title', '', { max: 40, required: true }),
          body: text('Text', '', { max: 80 }),
          ctaLabel: text('Link text', '', { max: 24 }),
          link: link('Goes to', '', { required: true, help: 'A page on the site (like /vendors), or #popular to jump to the dishes.' }),
        },
        [
          { enabled: true, audience: 'everyone', tone: 'basil', title: 'Open now', body: 'Kitchens taking orders right now.', ctaLabel: "See who's open", link: '/vendors?open=1' },
          { enabled: true, audience: 'everyone', tone: 'marigold', title: 'Top rated', body: 'Loved by customers.', ctaLabel: 'Browse', link: '/vendors?sort=rating' },
          { enabled: true, audience: 'everyone', tone: 'forest', title: 'Popular dishes', body: "What everyone's ordering.", ctaLabel: 'Jump to dishes', link: '#popular' },
          { enabled: true, audience: 'guests', tone: 'paper', title: 'New here?', body: 'Create a free account to order and track.', ctaLabel: 'Sign up', link: '/register' },
          { enabled: true, audience: 'customers', tone: 'paper', title: 'Your orders', body: "Track what's on its way.", ctaLabel: 'View orders', link: '/orders' },
          { enabled: true, audience: 'vendors', tone: 'paper', title: 'Your kitchen', body: 'Menu, orders and reviews.', ctaLabel: 'Dashboard', link: '/vendor/dashboard' },
          { enabled: true, audience: 'admins', tone: 'paper', title: 'Admin', body: 'Manage the marketplace.', ctaLabel: 'Open', link: '/admin' },
        ],
        { max: 12, itemTitle: 'title' }
      ),
    },
  },
  {
    key: 'home_sections',
    label: 'Home page: sections',
    description: 'The sections below the banner: their headings, how many items they show, and whether they appear.',
    previewPath: '/',
    fields: {
      categories: group('Shop by category', {
        show: toggle('Show this section', true),
        title: text('Heading', 'Shop by category', { max: 60 }),
        count: number('How many categories', 12, { min: 4, max: 24 }),
      }),
      kitchens: group('Kitchens', {
        show: toggle('Show this section', true),
        eyebrow: text('Small heading', 'On the menu today', { max: 40 }),
        title: text('Heading', 'Top kitchens right now', { max: 60 }),
        seeAllLabel: text('"See all" link text', 'See all', { max: 20 }),
        count: number('How many kitchens', 8, { min: 4, max: 12 }),
      }),
      dishes: group('Popular dishes', {
        show: toggle('Show this section', true),
        eyebrow: text('Small heading', 'Fresh off the pass', { max: 40 }),
        title: text('Heading', 'Popular right now', { max: 60 }),
        count: number('How many dishes', 8, { min: 4, max: 12 }),
      }),
      sellBanner: group('"Sell on the site" banner', {
        show: toggle('Show this banner', true),
        audience: audience('guests_customers'),
        title: text('Heading', 'Own a kitchen? Sell on {siteName}.', { max: 90 }),
        body: area('Text', 'Put your menu online, set your own opening hours and delivery fee, and get paid for every order.', { max: 220, rows: 2 }),
        ctaLabel: text('Button text', 'Register your kitchen', { max: 30 }),
        ctaLink: link('Button goes to', '/register', { required: true }),
      }),
    },
  },
  {
    key: 'footer',
    label: 'Footer',
    description: 'The bottom of every page: the blurb, link columns, contact details and social links.',
    previewPath: '/',
    fields: {
      about: area('Short blurb', 'Local kitchens, cooked to order. Every meal on this menu comes from a real vendor around the corner.', { max: 300 }),
      columns: list(
        'Link columns',
        'Column',
        {
          title: text('Column title', '', { max: 30, required: true }),
          links: list(
            'Links',
            'Link',
            {
              label: text('Text', '', { max: 40, required: true }),
              link: link('Goes to', '', { required: true }),
            },
            [],
            { max: 8, itemTitle: 'label' }
          ),
        },
        [
          { title: 'Explore', links: [{ label: 'Browse vendors', link: '/vendors' }, { label: 'Sell on {siteName}', link: '/register' }] },
          { title: 'Account', links: [{ label: 'Log in', link: '/login' }, { label: 'My orders', link: '/orders' }] },
          { title: 'Company', links: [{ label: 'About us', link: '/about' }, { label: 'About the founder', link: '/founder' }] },
          { title: 'Legal', links: [{ label: 'Terms of service', link: '/terms' }, { label: 'Privacy policy', link: '/privacy' }] },
        ],
        { max: 6, itemTitle: 'title' }
      ),
      contactEmail: text('Contact email', '', { max: 120, format: 'email' }),
      contactPhone: text('Contact phone', '', { max: 40 }),
      address: text('Address', '', { max: 160 }),
      social: list(
        'Social links',
        'Link',
        {
          label: text('Name', '', { max: 30, required: true, help: 'For example Instagram, Facebook, X, WhatsApp' }),
          link: link('Web address', '', { required: true }),
        },
        [],
        { max: 8, itemTitle: 'label' }
      ),
      copyright: text('Copyright line', 'Built for local kitchens.', { max: 120, help: 'Shown after "© year site name."' }),
    },
  },
  {
    key: 'auth',
    label: 'Login and sign-up pages',
    description: 'The headings on the Log in and Create account pages.',
    previewPath: '/login',
    fields: {
      login: group('Log in page', {
        eyebrow: text('Small heading', 'Welcome back', { max: 40 }),
        title: text('Heading', 'Log in to {siteName}', { max: 80 }),
        subtitle: text('Text under the heading', 'Pick up where you left off — your cart and orders are waiting.', { max: 160 }),
      }),
      register: group('Create account page', {
        eyebrow: text('Small heading', 'Get started', { max: 40 }),
        title: text('Heading', 'Create your account', { max: 80 }),
      }),
    },
  },
  {
    key: 'vendors_page',
    label: 'Vendors page',
    description: 'The heading and search hint on the page that lists all kitchens.',
    previewPath: '/vendors',
    fields: {
      eyebrow: text('Small heading', 'Full menu board', { max: 40 }),
      title: text('Heading', 'Vendors', { max: 60 }),
      searchPlaceholder: text('Search box hint', 'Search vendors, dishes or cuisines…', { max: 80 }),
    },
  },
  {
    key: 'pages',
    label: 'Page names',
    description: 'The titles of About, Founder, Terms and Privacy. (The text of those pages is edited under Pages.)',
    previewPath: '/about',
    fields: {
      aboutTitle: text('About page title', 'About us', { max: 60, required: true }),
      founderTitle: text('Founder page title', 'About the founder', { max: 60, required: true }),
      termsTitle: text('Terms page title', 'Terms of service', { max: 60, required: true }),
      privacyTitle: text('Privacy page title', 'Privacy policy', { max: 60, required: true }),
      emptyMessage: text('Message when a page has no text yet', "This page hasn't been written yet — check back soon.", { max: 160 }),
    },
  },
  {
    key: 'seo',
    label: 'Search engines and browser tabs',
    description: 'The title and description used in browser tabs and Google results.',
    previewPath: '/',
    fields: {
      homeTitle: text('Home page title', 'Order from local kitchens', { max: 70, help: 'Shown as "Site name | this".' }),
      description: area(
        'Description',
        'Order food from local kitchens near you. Browse verified vendors, add dishes to your cart and track your order.',
        { max: 200, rows: 2 }
      ),
    },
  },
];

const SECTION_MAP = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- defaults + merge --------------------------------------------------------
const defaultsOf = (fields) => {
  const out = {};
  for (const [key, def] of Object.entries(fields)) {
    if (def.type === 'group') out[key] = defaultsOf(def.fields);
    else if (def.type === 'list') out[key] = clone(def.default || []);
    else out[key] = def.default === undefined ? null : def.default;
  }
  return out;
};

// Saved content wins; anything missing (a field added after the admin last
// saved, a whole section never edited) falls back to the default. Lists are
// taken whole from what was saved — an empty saved list means "none".
const mergeFields = (fields, saved) => {
  const out = {};
  const source = saved && typeof saved === 'object' ? saved : {};
  for (const [key, def] of Object.entries(fields)) {
    if (def.type === 'group') {
      out[key] = mergeFields(def.fields, source[key]);
    } else if (def.type === 'list') {
      out[key] = Array.isArray(source[key]) ? source[key] : clone(def.default || []);
    } else {
      out[key] = source[key] === undefined ? (def.default === undefined ? null : def.default) : source[key];
    }
  }
  return out;
};

const effectiveSection = (key, saved) => mergeFields(SECTION_MAP[key].fields, saved);

const allEffective = (savedByKey = {}) =>
  Object.fromEntries(SECTIONS.map((s) => [s.key, effectiveSection(s.key, savedByKey[s.key])]));

const allDefaults = () => Object.fromEntries(SECTIONS.map((s) => [s.key, defaultsOf(s.fields)]));

// ---- validation ----------------------------------------------------------------
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A link may point to a page on this site (/vendors?open=1), an anchor on the
// current page (#popular), a web address, an email or a phone number. Anything
// else — javascript:, data:, protocol-relative //evil.com — is refused.
const isSafeLink = (value) => {
  if (/^\/(?!\/)[^\s]*$/.test(value)) return true;
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return true;
  if (/^tel:[+0-9()\-\s]{3,30}$/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
    } catch {
      return false;
    }
  }
  return false;
};

const sanitize = (def, value, path, errors) => {
  const name = path;
  const fail = (msg) => {
    errors.push({ field: path, message: `${name} ${msg}` });
    return undefined;
  };

  switch (def.type) {
    case 'text':
    case 'textarea': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('must be text.');
      let v = value.replace(CONTROL_CHARS, '');
      v = def.type === 'text' ? v.replace(/\s*[\r\n]+\s*/g, ' ').trim() : v.replace(/\r\n/g, '\n').trim();
      if (def.required && !v) return fail('is required.');
      if (v.length > (def.max || 500)) return fail(`is too long (max ${def.max || 500} characters).`);
      if (v && def.format === 'email' && !EMAIL_RE.test(v)) return fail('must be a valid email address.');
      return v;
    }
    case 'link': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') return fail('must be a link.');
      const v = value.trim();
      if (!v) return def.required ? fail('is required.') : '';
      if (v.length > 500) return fail('is too long.');
      if (!isSafeLink(v)) {
        return fail('must be a page on the site (like /vendors), a web address starting with https://, an email (mailto:) or a phone number (tel:).');
      }
      return v;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') return fail('must be on or off.');
      return value;
    }
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return fail('must be a number.');
      if (def.integer && !Number.isInteger(n)) return fail('must be a whole number.');
      if (def.min !== undefined && n < def.min) return fail(`must be at least ${def.min}.`);
      if (def.max !== undefined && n > def.max) return fail(`must be at most ${def.max}.`);
      return n;
    }
    case 'select': {
      if (!def.options.some((o) => o.value === value)) return fail('is not one of the allowed choices.');
      return value;
    }
    case 'image': {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string' || !/^https:\/\/\S+$/i.test(value) || value.length > 500) {
        return fail('must be an uploaded image.');
      }
      return value;
    }
    case 'group': {
      const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      return sanitizeFields(def.fields, src, path, errors);
    }
    case 'list': {
      if (value === undefined || value === null) value = [];
      if (!Array.isArray(value)) return fail('must be a list.');
      if (value.length > (def.max || 10)) return fail(`can have at most ${def.max || 10} items.`);
      if (def.min && value.length < def.min) return fail(`needs at least ${def.min} item(s).`);
      return value.map((item, i) => {
        const src = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
        return sanitizeFields(def.fields, src, `${path} - ${def.itemLabel || 'Item'} ${i + 1}`, errors);
      });
    }
    default:
      return undefined;
  }
};

const sanitizeFields = (fields, input, prefix, errors) => {
  const out = {};
  for (const [key, def] of Object.entries(fields)) {
    const label = def.label || key;
    const path = prefix ? `${prefix} - ${label}` : label;
    const value = sanitize(def, input[key], path, errors);
    if (value !== undefined) out[key] = value;
  }
  return out;
};

// Returns the cleaned content, or throws a 422 listing every problem at once.
const validateSection = (key, input) => {
  const section = SECTION_MAP[key];
  if (!section) throw new ApiError(404, 'Unknown content section.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'Content must be an object.');
  }
  const errors = [];
  const clean = sanitizeFields(section.fields, input, '', errors);
  if (errors.length > 0) {
    throw new ApiError(422, `Please fix ${errors.length} thing${errors.length === 1 ? '' : 's'} and try again.`, errors);
  }
  return clean;
};

// What the admin screen needs to draw the forms.
const publicSchema = () =>
  SECTIONS.map(({ key, label, description, previewPath, fields }) => ({ key, label, description, previewPath, fields }));

module.exports = {
  SECTIONS,
  SECTION_MAP,
  AUDIENCES,
  allDefaults,
  allEffective,
  effectiveSection,
  validateSection,
  publicSchema,
  isSafeLink,
};
