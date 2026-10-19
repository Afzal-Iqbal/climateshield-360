import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'ClimateShield 360',
      subtitle: 'Karachi Extreme-Weather Decision Support (Sindh PDMA / KMC)',
      officialNotice: 'OFFICIAL NOTICE: Information only, decision-support aid. Not professional or binding legal advice. In an emergency contact official services (PDMA 1736 | Rescue 1122).',
      sampleDataNotice: 'OPERATIONAL SIMULATION MODE: All numeric figures tagged with [Sample Data]. Not real-time meteorological observations.',
      nav: {
        overview: 'Overview',
        riskMap: 'Risk Map',
        eightImpacts: 'Eight Impacts',
        insightAgent: 'Insight Agent',
        dataQuality: 'Data Quality',
        pipelineFreshness: 'Pipeline & Freshness',
        aboutLimits: 'About & Limits',
      },
      risks: {
        low: 'Low',
        moderate: 'Moderate',
        high: 'High',
        severe: 'Severe',
      },
      common: {
        loading: 'Loading telemetry...',
        noData: 'No data available',
        status: 'Status',
        lastUpdated: 'Last Updated',
        confidence: 'Confidence Interval',
        baseline: 'Baseline Comparison',
      },
    },
  },
  ur: {
    translation: {
      appName: 'کلائمیٹ شیلڈ 360',
      subtitle: 'کراچی شدید موسمی خطرات اور ایمرجنسی سپورٹ ڈیش بورڈ (پی ڈی ایم اے سندھ)',
      officialNotice: 'سرکاری انتباہ: یہ معلومات صرف فیصلے کی معاونت کے لیے ہیں۔ ہنگامی صورتحال میں فوری طور پر پی ڈی ایم اے (1736) یا ریسکیو 1122 سے رابطہ کریں۔',
      sampleDataNotice: 'عملی نقلی موڈ: تمام اعداد و شمار [سیمپل ڈیٹا] ہیں۔ براہ راست پیمائش نہیں۔',
      nav: {
        overview: 'مجموعی جائزہ',
        riskMap: 'رسک میپ',
        eightImpacts: 'آٹھ اثرات',
        insightAgent: 'ان سائٹ ایجنٹ',
        dataQuality: 'ڈیٹا کوالٹی',
        pipelineFreshness: 'پائپ لائن اور تازگی',
        aboutLimits: 'تعارف و حدود',
      },
      risks: {
        low: 'کم خطرہ',
        moderate: 'معتدل خطرہ',
        high: 'زیادہ خطرہ',
        severe: 'شدید خطرہ',
      },
      common: {
        loading: 'ڈیٹا لوڈ ہو رہا ہے...',
        noData: 'کوئی ڈیٹا دستیاب نہیں',
        status: 'حیثیت',
        lastUpdated: 'آخری اپ ڈیٹ',
        confidence: 'اعتماد کا وقفہ',
        baseline: 'بنیادی موازنہ',
      },
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
