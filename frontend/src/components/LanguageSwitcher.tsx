import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    
    // Always use LTR layout, even for Arabic
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = newLang;
  };

  // Show the language you'll switch to (inverse of current)
  const switchToLanguage = i18n.language === 'en' ? 'العربية' : 'English';

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
      title={t('language.switchLanguage')}
    >
      <Globe size={16} />
      <span>{switchToLanguage}</span>
    </button>
  );
};

export default LanguageSwitcher; 