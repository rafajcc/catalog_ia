import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type Language = 'es' | 'en';

export const STORAGE_KEY = 'catalogia_lang';

export const translations: Record<Language, Record<string, string>> = {
  es: {
    'tabs.upload': 'Subir datos',
    'tabs.configuration': 'Configuración',
    'tabs.validation': 'Validación',
    'tabs.images': 'Imágenes',
    'tabs.ai': 'IA',
    'tabs.sync': 'Sincronización',
    'tabs.review': 'Revisión',
    'common.dataId': 'Id de datos: {id}',
    'header.statusLabel': 'Estado:',
    'header.language': 'Idioma',
    'status.online': 'En línea',
    'status.offline': 'Sin conexión',
    'status.degraded': 'Degradado',
    'status.checking': 'Comprobando…',
    'dashboard.emptyDataNotice': 'Sube primero un CSV para habilitar este paso.',
    'dashboard.footerUnlock': 'Completa el paso de subida para desbloquear los flujos de producto.',
    'upload.title': 'Subida de datos',
    'upload.csvLabel': 'Catálogo de productos (CSV)',
    'upload.csvButton': 'Subir y procesar CSV',
    'upload.imagesLabel': 'Imágenes de producto',
    'upload.imagesButton': 'Subir imágenes',
    'upload.folderLabel': 'Ruta de carpeta de imágenes',
    'upload.folderPlaceholder': 'C:/imagenes',
    'upload.folderButton': 'Seleccionar carpeta',
    'upload.errorNoCsv': 'Selecciona primero un archivo CSV',
    'upload.errorNoImages': 'Selecciona al menos una imagen primero',
    'upload.errorNoFolder': 'Introduce una ruta de carpeta de imágenes',
    'upload.successProcessed': 'Archivo procesado. Id de datos: {id}',
    'upload.successUploaded': 'Archivo subido correctamente',
    'upload.successImages': '{count} imagen(es) subida(s)',
    'upload.successFolder': 'Carpeta de imágenes seleccionada',
    'config.title': 'Configuración',
    'config.prestashopSection': 'PrestaShop',
    'config.baseUrl': 'URL base',
    'config.baseUrlPlaceholder': 'https://tienda.ejemplo.com',
    'config.psApiKey': 'Clave API de PrestaShop',
    'config.version': 'Versión',
    'config.languageId': 'Id de idioma',
    'config.testPrestashop': 'Probar conexión PrestaShop',
    'config.prestashopOk': 'Conexión PrestaShop correcta',
    'config.aiSection': 'Contenido IA',
    'config.provider': 'Proveedor',
    'config.model': 'Modelo',
    'config.aiLanguage': 'Idioma',
    'config.aiApiKey': 'Clave API de IA',
    'config.testAi': 'Probar conexión IA',
    'config.aiOk': 'Conexión IA correcta',
    'config.save': 'Guardar configuración',
    'config.saved': 'Configuración guardada',
    'validation.title': 'Validación',
    'validation.validateButton': 'Validar productos',
    'validation.loadButton': 'Cargar resultados',
    'validation.finished': 'Validación finalizada',
    'validation.loaded': 'Resultados cargados',
    'validation.total': '{count} en total',
    'validation.valid': '{count} válidos',
    'validation.withErrors': '{count} con errores',
    'validation.name': 'Nombre',
    'validation.errors': 'Errores',
    'validation.countProducts': '{count} productos',
    'images.title': 'Emparejamiento de imágenes',
    'images.strategy': 'Estrategia',
    'images.strategyEan': 'EAN',
    'images.strategyReference': 'Referencia',
    'images.strategyFilename': 'Patrón de nombre de archivo',
    'images.strategyManual': 'Manual',
    'images.threshold': 'Umbral mínimo',
    'images.matchButton': 'Emparejar imágenes',
    'images.loadButton': 'Cargar resultados',
    'images.matchingFinished': 'Emparejamiento finalizado',
    'images.resultsLoaded': 'Resultados cargados',
    'images.matches': '{count} coincidencias',
    'images.product': 'Producto',
    'images.images': 'Imágenes',
    'images.score': 'Puntuación',
    'images.tableStrategy': 'Estrategia',
    'ai.title': 'Sugerencias de IA',
    'ai.provider': 'Proveedor',
    'ai.language': 'Idioma',
    'ai.fields': 'Campos',
    'ai.fieldName': 'Nombre',
    'ai.fieldShortDescription': 'Descripción corta',
    'ai.fieldDescription': 'Descripción',
    'ai.fieldMetaTitle': 'Título meta',
    'ai.fieldMetaDescription': 'Descripción meta',
    'ai.fieldLinkRewrite': 'Enlace amigable',
    'ai.generateButton': 'Generar sugerencias',
    'ai.loadButton': 'Cargar sugerencias',
    'ai.generated': 'Sugerencias generadas',
    'ai.loaded': 'Sugerencias cargadas',
    'ai.suggestions': '{count} sugerencias',
    'ai.field': 'Campo',
    'ai.suggestedValue': 'Valor sugerido',
    'ai.confidence': 'Confianza',
    'sync.title': 'Sincronización',
    'sync.batchSize': 'Tamaño de lote',
    'sync.createSession': 'Crear sesión',
    'sync.sessionCreated': 'Sesión {id} creada',
    'sync.sessionLabel': 'Sesión: {id}',
    'sync.statusLabel': 'Estado: {status}',
    'sync.dryRun': 'Prueba',
    'sync.start': 'Iniciar sincronización',
    'sync.started': 'Sincronización iniciada',
    'sync.getResults': 'Obtener resultados',
    'sync.resultsLoaded': 'Resultados cargados',
    'sync.completed': '{count} completadas',
    'sync.failed': '{count} fallidas',
    'review.title': 'Revisión',
    'review.loadButton': 'Cargar estado de revisión',
    'review.loaded': 'Estado de revisión cargado',
    'review.products': '{count} productos',
    'review.valid': '{count} válidos',
    'review.invalid': '{count} inválidos',
    'review.withSuggestions': '{count} con sugerencias',
    'review.acceptAll': 'Aceptar todo',
    'review.accepted': 'Todos los cambios aceptados',
    'review.export': 'Exportar',
    'review.exported': 'Estado de revisión exportado'
  },
  en: {
    'tabs.upload': 'Upload',
    'tabs.configuration': 'Configuration',
    'tabs.validation': 'Validation',
    'tabs.images': 'Images',
    'tabs.ai': 'AI',
    'tabs.sync': 'Sync',
    'tabs.review': 'Review',
    'common.dataId': 'Data id: {id}',
    'header.statusLabel': 'Status:',
    'header.language': 'Language',
    'status.online': 'Online',
    'status.offline': 'Offline',
    'status.degraded': 'Degraded',
    'status.checking': 'Checking…',
    'dashboard.emptyDataNotice': 'Upload a CSV first to enable this step.',
    'dashboard.footerUnlock': 'Complete the upload step to unlock product workflows.',
    'upload.title': 'Data upload',
    'upload.csvLabel': 'Product catalog (CSV)',
    'upload.csvButton': 'Upload and process CSV',
    'upload.imagesLabel': 'Product images',
    'upload.imagesButton': 'Upload images',
    'upload.folderLabel': 'Image folder path',
    'upload.folderPlaceholder': 'C:/images',
    'upload.folderButton': 'Select folder',
    'upload.errorNoCsv': 'Select a CSV file first',
    'upload.errorNoImages': 'Select at least one image first',
    'upload.errorNoFolder': 'Enter an image folder path',
    'upload.successProcessed': 'File processed. Data id: {id}',
    'upload.successUploaded': 'File uploaded successfully',
    'upload.successImages': '{count} image(s) uploaded',
    'upload.successFolder': 'Image folder selected',
    'config.title': 'Configuration',
    'config.prestashopSection': 'PrestaShop',
    'config.baseUrl': 'Base URL',
    'config.baseUrlPlaceholder': 'https://shop.example.com',
    'config.psApiKey': 'PrestaShop API key',
    'config.version': 'Version',
    'config.languageId': 'Language ID',
    'config.testPrestashop': 'Test PrestaShop connection',
    'config.prestashopOk': 'PrestaShop connection OK',
    'config.aiSection': 'AI content',
    'config.provider': 'Provider',
    'config.model': 'Model',
    'config.aiLanguage': 'Language',
    'config.aiApiKey': 'AI API key',
    'config.testAi': 'Test AI connection',
    'config.aiOk': 'AI connection OK',
    'config.save': 'Save configuration',
    'config.saved': 'Configuration saved',
    'validation.title': 'Validation',
    'validation.validateButton': 'Validate products',
    'validation.loadButton': 'Load results',
    'validation.finished': 'Validation finished',
    'validation.loaded': 'Results loaded',
    'validation.total': '{count} total',
    'validation.valid': '{count} valid',
    'validation.withErrors': '{count} with errors',
    'validation.name': 'Name',
    'validation.errors': 'Errors',
    'validation.countProducts': '{count} products',
    'images.title': 'Image matching',
    'images.strategy': 'Strategy',
    'images.strategyEan': 'EAN',
    'images.strategyReference': 'Reference',
    'images.strategyFilename': 'Filename pattern',
    'images.strategyManual': 'Manual',
    'images.threshold': 'Minimum threshold',
    'images.matchButton': 'Match images',
    'images.loadButton': 'Load results',
    'images.matchingFinished': 'Matching finished',
    'images.resultsLoaded': 'Results loaded',
    'images.matches': '{count} matches',
    'images.product': 'Product',
    'images.images': 'Images',
    'images.score': 'Score',
    'images.tableStrategy': 'Strategy',
    'ai.title': 'AI suggestions',
    'ai.provider': 'Provider',
    'ai.language': 'Language',
    'ai.fields': 'Fields',
    'ai.fieldName': 'Name',
    'ai.fieldShortDescription': 'Short description',
    'ai.fieldDescription': 'Description',
    'ai.fieldMetaTitle': 'Meta title',
    'ai.fieldMetaDescription': 'Meta description',
    'ai.fieldLinkRewrite': 'Link rewrite',
    'ai.generateButton': 'Generate suggestions',
    'ai.loadButton': 'Load suggestions',
    'ai.generated': 'Suggestions generated',
    'ai.loaded': 'Suggestions loaded',
    'ai.suggestions': '{count} suggestions',
    'ai.field': 'Field',
    'ai.suggestedValue': 'Suggested value',
    'ai.confidence': 'Confidence',
    'sync.title': 'Synchronization',
    'sync.batchSize': 'Batch size',
    'sync.createSession': 'Create session',
    'sync.sessionCreated': 'Session {id} created',
    'sync.sessionLabel': 'Session: {id}',
    'sync.statusLabel': 'Status: {status}',
    'sync.dryRun': 'Dry run',
    'sync.start': 'Start sync',
    'sync.started': 'Sync started',
    'sync.getResults': 'Get results',
    'sync.resultsLoaded': 'Results loaded',
    'sync.completed': '{count} completed',
    'sync.failed': '{count} failed',
    'review.title': 'Review',
    'review.loadButton': 'Load review state',
    'review.loaded': 'Review state loaded',
    'review.products': '{count} products',
    'review.valid': '{count} valid',
    'review.invalid': '{count} invalid',
    'review.withSuggestions': '{count} with suggestions',
    'review.acceptAll': 'Accept all',
    'review.accepted': 'All changes accepted',
    'review.export': 'Export',
    'review.exported': 'Review state exported'
  }
};

export type TranslateParams = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: TranslateParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'es';
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'es' ? stored : 'es';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: TranslateParams) => {
      let template = translations[language][key] ?? translations.en[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([name, value]) => {
          template = template.split(`{${name}}`).join(String(value));
        });
      }
      return template;
    },
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
