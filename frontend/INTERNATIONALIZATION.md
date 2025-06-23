# Internationalization (i18n) Setup

This application has been configured to support multiple languages, currently English and Arabic, with full RTL (Right-to-Left) support for Arabic.

## Features

- ✅ **Multi-language Support**: English and Arabic
- ✅ **RTL Support**: Full right-to-left layout for Arabic
- ✅ **Language Detection**: Automatic language detection from browser
- ✅ **Language Persistence**: Language preference saved in localStorage
- ✅ **Dynamic Language Switching**: Switch languages without page reload
- ✅ **Responsive Design**: Works on all screen sizes in both LTR and RTL

## Technology Stack

- **react-i18next**: React internationalization framework
- **i18next**: Core internationalization library
- **i18next-browser-languagedetector**: Automatic language detection
- **i18next-http-backend**: HTTP backend for loading translations

## File Structure

```
src/
├── i18n/
│   ├── index.ts                 # i18n configuration
│   └── locales/
│       ├── en.json             # English translations
│       └── ar.json             # Arabic translations
├── hooks/
│   └── useLanguageDirection.ts # Language direction hook
├── components/
│   └── LanguageSwitcher.tsx    # Language switcher component
└── pages/                      # All pages with translations
```

## Usage

### Using Translations in Components

```tsx
import { useTranslation } from 'react-i18next';

const MyComponent: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('common.description')}</p>
    </div>
  );
};
```

### Translation Keys Structure

The translation files are organized into logical sections:

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "auth": {
    "signIn": "Sign In",
    "username": "Username",
    "password": "Password"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "barcodeScanner": "Barcode Scanner"
  }
}
```

### Adding New Languages

1. Create a new translation file in `src/i18n/locales/` (e.g., `fr.json`)
2. Add the language to the resources in `src/i18n/index.ts`:

```tsx
import frTranslations from './locales/fr.json';

const resources = {
  en: { translation: enTranslations },
  ar: { translation: arTranslations },
  fr: { translation: frTranslations }, // Add new language
};
```

3. Update the LanguageSwitcher component to include the new language

### RTL Support

The application automatically handles RTL layout for Arabic:

- **CSS Classes**: RTL-specific styles are applied when `[dir="rtl"]` is present
- **Layout Direction**: Flexbox and grid layouts automatically reverse
- **Text Alignment**: Text alignment adjusts automatically
- **Margins/Padding**: Spacing classes are automatically reversed

### Language Switcher

The language switcher is available in the sidebar and allows users to:
- Switch between English and Arabic
- See the current language
- Automatically update the layout direction

## Best Practices

1. **Use Translation Keys**: Always use translation keys instead of hardcoded text
2. **Organize Keys**: Group related translations logically
3. **Context Matters**: Provide context for translators in comments
4. **Test Both Languages**: Always test in both English and Arabic
5. **RTL Testing**: Verify layout works correctly in RTL mode

## Adding New Translations

1. Add the English text to `src/i18n/locales/en.json`
2. Add the Arabic translation to `src/i18n/locales/ar.json`
3. Use the translation key in your component with `t('key.path')`

## Example: Adding a New Feature

```tsx
// 1. Add to en.json
{
  "newFeature": {
    "title": "New Feature",
    "description": "This is a new feature",
    "button": "Activate Feature"
  }
}

// 2. Add to ar.json
{
  "newFeature": {
    "title": "ميزة جديدة",
    "description": "هذه ميزة جديدة",
    "button": "تفعيل الميزة"
  }
}

// 3. Use in component
const NewFeatureComponent: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h2>{t('newFeature.title')}</h2>
      <p>{t('newFeature.description')}</p>
      <button>{t('newFeature.button')}</button>
    </div>
  );
};
```

## Troubleshooting

### Language Not Switching
- Check if the translation key exists in both language files
- Verify the language switcher is properly connected
- Check browser console for errors

### RTL Layout Issues
- Ensure CSS classes are properly defined for RTL
- Check if `[dir="rtl"]` is applied to the document
- Verify flexbox/grid layouts work in both directions

### Missing Translations
- Add missing keys to both language files
- Use fallback language (English) for missing translations
- Check translation key paths are correct

## Future Enhancements

- [ ] Add more languages (French, Spanish, etc.)
- [ ] Implement number formatting for different locales
- [ ] Add date/time formatting for different locales
- [ ] Implement pluralization rules for different languages
- [ ] Add translation management interface for admins 