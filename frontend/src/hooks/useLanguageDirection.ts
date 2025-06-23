import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const useLanguageDirection = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Set initial direction based on current language
    const currentLang = i18n.language;
    
    // Always use LTR layout, even for Arabic
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = currentLang;

    // Listen for language changes
    const handleLanguageChange = (lng: string) => {
      // Always use LTR layout, even for Arabic
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = lng;
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  return {
    isRTL: false, // Always return false to prevent RTL layout
    language: i18n.language,
  };
}; 