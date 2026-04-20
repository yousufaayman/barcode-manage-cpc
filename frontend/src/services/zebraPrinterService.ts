interface ZebraPrinter {
  name: string;
  connectionType: string;
}

interface ZebraResponse {
  success: boolean;
  data?: any;
  error?: string;
}

import api from './api';

interface BarcodePrintData {
  barcode: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  quantity: number;
  layers: number;
  serial?: number | string;
  /** Job order / PO number for label line */
  job_order_number?: string;
  /** Use alternate sticker layout (second degree batches) */
  is_second_degree?: boolean;
  /** Use alternate sticker layout (rework batches) */
  is_rework?: boolean;
  /** For rework layout: sewing phase name (line) */
  phase_name?: string;
  /** For rework layout: problem stage name */
  stage_name?: string;
}

/** Browser Print 3.x device instance (from `BrowserPrint-3.x.min.js` + optional `BrowserPrint-Zebra`) */
interface BrowserPrintV3Device {
  name: string;
  connection?: string;
  deviceType?: string;
  send: (data: string, onFinished?: (result?: string) => void, onError?: (err?: string) => void) => void;
}

/** Union of legacy (1.x) and modern (3.x) global `BrowserPrint` objects */
interface BrowserPrintSdk {
  isServiceAvailable?: (callback: (response: ZebraResponse) => void) => void;
  getPrinters?: (callback: (response: ZebraResponse) => void) => void;
  getDefaultPrinter?: (callback: (response: ZebraResponse) => void) => void;
  setDefaultPrinter?: (printerName: string, callback: (response: ZebraResponse) => void) => void;
  send?: (printerName: string, printData: string, callback: (response: ZebraResponse) => void) => void;
  getApplicationConfiguration?: (
    success: (config: Record<string, unknown> | null) => void,
    error?: (message?: string) => void
  ) => void;
  getLocalDevices?: (
    success: (devices: BrowserPrintV3Device[] | Record<string, unknown>) => void,
    error?: (message?: string) => void,
    deviceType?: string
  ) => void;
  getDefaultDevice?: (
    deviceType: string | undefined,
    success: (device: BrowserPrintV3Device | null) => void,
    error?: (message?: string) => void
  ) => void;
}

declare global {
  interface Window {
    BrowserPrint: BrowserPrintSdk;
  }
}

function browserPrintConfigLooksLive(config: Record<string, unknown> | null): boolean {
  if (!config) return false;
  const app = config.application as Record<string, unknown> | undefined;
  const v =
    (typeof app?.version === 'string' ? app.version : '').trim() ||
    (typeof config.version === 'string' ? config.version : '').trim();
  return v.length > 0;
}

class ZebraPrinterService {
  private isServiceReady = false;
  /** `null` until first successful probe */
  private browserPrintMode: 'legacy' | 'v3' | null = null;
  private defaultPrinter: ZebraPrinter | null = null;
  private availablePrinters: ZebraPrinter[] = [];
  /** Browser Print 3.x: map display name → device for `send` */
  private v3DevicesByName = new Map<string, BrowserPrintV3Device>();
  /** Cached ZPL Arabic line from API (^FO...^A@...); undefined = not fetched yet */
  private secondDegreeArabicFragment: string | undefined = undefined;
  private readonly arabicFontPath = 'E:TT0003M_.TTF';

  constructor() {
    this.initializeService();
  }

  private getBp(): BrowserPrintSdk {
    if (typeof window.BrowserPrint === 'undefined') {
      throw new Error('Zebra Browser Print service is not available. Please install Zebra Browser Print software.');
    }
    return window.BrowserPrint;
  }

  private detectBrowserPrintMode(): 'legacy' | 'v3' {
    const bp = this.getBp();
    if (typeof bp.isServiceAvailable === 'function') return 'legacy';
    if (typeof bp.getApplicationConfiguration === 'function') return 'v3';
    throw new Error('Unrecognized Zebra Browser Print JavaScript API.');
  }

  private normalizeV3DeviceList(result: unknown): BrowserPrintV3Device[] {
    const isDevice = (d: unknown): d is BrowserPrintV3Device =>
      !!d &&
      typeof d === 'object' &&
      typeof (d as BrowserPrintV3Device).send === 'function' &&
      typeof (d as BrowserPrintV3Device).name === 'string';

    if (Array.isArray(result)) {
      return result.filter(isDevice);
    }
    if (result && typeof result === 'object') {
      const out: BrowserPrintV3Device[] = [];
      for (const v of Object.values(result as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (isDevice(item)) out.push(item);
          }
        }
      }
      return out;
    }
    return [];
  }

  private cacheV3Devices(devices: BrowserPrintV3Device[]): void {
    this.v3DevicesByName.clear();
    const list: ZebraPrinter[] = [];
    for (const d of devices) {
      this.v3DevicesByName.set(d.name, d);
      list.push({
        name: d.name,
        connectionType: d.connection || d.deviceType || 'USB',
      });
    }
    this.availablePrinters = list;
  }

  private async initializeService(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const bp = this.getBp();
        const mode = (this.browserPrintMode ??= this.detectBrowserPrintMode());

        if (mode === 'legacy') {
          if (!bp.isServiceAvailable) {
            reject(new Error('Zebra Browser Print legacy API missing isServiceAvailable.'));
            return;
          }
          bp.isServiceAvailable((response) => {
            if (response.success && response.data?.available) {
              this.isServiceReady = true;
              resolve();
            } else {
              reject(new Error('Zebra Browser Print service is not running. Please start the service.'));
            }
          });
          return;
        }

        if (!bp.getApplicationConfiguration) {
          reject(new Error('Zebra Browser Print 3.x API missing getApplicationConfiguration.'));
          return;
        }
        bp.getApplicationConfiguration(
          (config) => {
            if (browserPrintConfigLooksLive(config)) {
              this.isServiceReady = true;
              resolve();
            } else {
              reject(new Error('Zebra Browser Print service is not running. Please start the service.'));
            }
          },
          () => reject(new Error('Zebra Browser Print service is not running. Please start the service.'))
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  async checkServiceAvailability(): Promise<boolean> {
    try {
      await this.initializeService();
      return true;
    } catch (error) {
      console.error('Zebra Browser Print service not available:', error);
      return false;
    }
  }

  async getAvailablePrinters(): Promise<ZebraPrinter[]> {
    if (!this.isServiceReady || !this.browserPrintMode) {
      throw new Error('Service not ready');
    }

    if (this.browserPrintMode === 'legacy') {
      const bp = this.getBp();
      if (!bp.getPrinters) throw new Error('BrowserPrint.getPrinters not available');
      return new Promise((resolve, reject) => {
        bp.getPrinters!((response) => {
          if (response.success && response.data) {
            this.availablePrinters = response.data;
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Failed to get printers'));
          }
        });
      });
    }

    const bp = this.getBp();
    if (!bp.getLocalDevices) throw new Error('BrowserPrint.getLocalDevices not available');

    return new Promise((resolve, reject) => {
      const finish = (devices: BrowserPrintV3Device[]) => {
        this.cacheV3Devices(devices);
        resolve(this.availablePrinters);
      };

      const onErr = (msg?: string) => reject(new Error(msg || 'Failed to get printers'));

      bp.getLocalDevices!(
        (result) => {
          const filtered = this.normalizeV3DeviceList(result);
          if (filtered.length > 0) {
            finish(filtered);
            return;
          }
          bp.getLocalDevices!(
            (full) => finish(this.normalizeV3DeviceList(full)),
            onErr
          );
        },
        onErr,
        'printer'
      );
    });
  }

  async getDefaultPrinter(): Promise<ZebraPrinter | null> {
    if (!this.isServiceReady || !this.browserPrintMode) {
      throw new Error('Service not ready');
    }

    if (this.browserPrintMode === 'legacy') {
      const bp = this.getBp();
      if (!bp.getDefaultPrinter) throw new Error('BrowserPrint.getDefaultPrinter not available');
      return new Promise((resolve, reject) => {
        bp.getDefaultPrinter!((response) => {
          if (response.success && response.data) {
            this.defaultPrinter = response.data;
            resolve(response.data);
          } else {
            resolve(null);
          }
        });
      });
    }

    const bp = this.getBp();
    if (!bp.getDefaultDevice) throw new Error('BrowserPrint.getDefaultDevice not available');

    return new Promise((resolve, reject) => {
      bp.getDefaultDevice!(
        'printer',
        (device) => {
          if (device && device.name) {
            this.v3DevicesByName.set(device.name, device);
            this.defaultPrinter = {
              name: device.name,
              connectionType: device.connection || device.deviceType || 'USB',
            };
            resolve(this.defaultPrinter);
          } else {
            resolve(null);
          }
        },
        () => resolve(null)
      );
    });
  }

  async setDefaultPrinter(printerName: string): Promise<boolean> {
    if (!this.isServiceReady || !this.browserPrintMode) {
      throw new Error('Service not ready');
    }

    if (this.browserPrintMode === 'legacy') {
      const bp = this.getBp();
      if (!bp.setDefaultPrinter) throw new Error('BrowserPrint.setDefaultPrinter not available');
      return new Promise((resolve, reject) => {
        bp.setDefaultPrinter!(printerName, (response) => {
          if (response.success) {
            this.defaultPrinter = { name: printerName, connectionType: 'USB' };
            resolve(true);
          } else {
            reject(new Error(response.error || 'Failed to set default printer'));
          }
        });
      });
    }

    const fromList = this.availablePrinters.find((p) => p.name === printerName);
    const conn = fromList?.connectionType || 'USB';
    this.defaultPrinter = { name: printerName, connectionType: conn };
    return true;
  }

  /**
   * @param secondDegreeArabicField - ^FO...^A@...^FD...^FS from GET /barcodes/zpl/second-degree-arabic-graphic (may be empty). Uses ^CI28 for UTF-8.
   */
  generateZPL(barcodeData: BarcodePrintData, secondDegreeArabicField: string = ''): string {
    const cleanText = (text: string): string => {
      if (!text) return '';
      return text.replace(/[\n\r\t]/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
    };

    const zplSafeUtf8 = (text: string): string => {
      if (!text) return '';
      // Avoid ZPL control chars and line breaks inside ^FD...^FS.
      return String(text)
        .replace(/[\n\r\t]/g, ' ')
        .replace(/[\^~]/g, ' ')
        .trim();
    };

    const client = cleanText(barcodeData.brand);
    const model = cleanText(barcodeData.model);
    const color = zplSafeUtf8(barcodeData.color ?? '');
    const qty = String(barcodeData.quantity ?? 0);
    const size = zplSafeUtf8(barcodeData.size ?? '');
    // Sticker says "Serial:" for legacy wording; value is batch.layers from DB (not ops.batches.serial).
    const layersStr = String(barcodeData.layers ?? '');
    const po = cleanText(barcodeData.job_order_number ?? '');
    const cleanBarcode = cleanText(barcodeData.barcode);
    const arabic = (secondDegreeArabicField || '').trim();

    if (barcodeData.is_rework) {
      // Rework label rendered as UTF-8 raw Arabic with printer font alias 1.
      const reworkColor = zplSafeUtf8(barcodeData.color ?? '');
      const reworkSize = zplSafeUtf8(barcodeData.size ?? '');
      const reworkPhase = zplSafeUtf8(barcodeData.phase_name ?? '');
      const reworkStage = zplSafeUtf8(barcodeData.stage_name ?? '');
      const lines = [
        '^XA',
        '^PW800',
        '^LL400',
        '^CI28',
        `^CW1,${this.arabicFontPath}`,
        '^PA0,1,1,1',
        '^FO30,60^BY2,2.5,50',
        '^BCN,80,Y,N,N',
        `^FD${zplSafeUtf8(barcodeData.barcode ?? '')}^FS`,
        '^FO340,20^A1N,30,30^FDإصلاح^FS',
        `^FO20,200^A1N,30,30^FDالعميل: ${client} | الموديل: ${model}^FS`,
        `^FO20,270^A1N,30,30^FDاللون: ${reworkColor} | المقاس: ${reworkSize} | المرحلة: ${reworkPhase}^FS`,
        `^FO20,340^A1N,30,30^FDPO: ${po} | المرحلة: ${reworkStage}^FS`,
        '^XZ',
      ];
      return lines.join('\r\n');
    }

    if (barcodeData.is_second_degree) {
      const lines = [
        '^XA',
        '^PW800',
        '^LL400',
        '^CI28',
        `^CW1,${this.arabicFontPath}`,
        '^PA0,1,1,1',
        '^FO30,50^BY2,2.5,50',
        '^BCN,80,Y,N,N',
        `^FD${cleanBarcode}^FS`,
        `^FO50,200^A1N,35,35^FDالعميل: ${client} | الموديل: ${model}^FS`,
        `^FO50,270^A1N,35,35^FDاللون: ${color} | الكمية: ${qty} | المقاس: ${size}^FS`,
        `^FO50,340^A0N,35,35^FDPO: ${po} |^FS`,
      ];
      if (arabic) {
        lines.push(arabic);
      } else {
        lines.push('^FO580,340^A1N,50,50^FDدرجة ثانية^FS');
      }
      lines.push('^PQ1', '^XZ');
      return lines.join('\r\n');
    }

    return [
      '^XA',
      '^PW800',
      '^LL400',
      '^CI28',
      `^CW1,${this.arabicFontPath}`,
      '^PA0,1,1,1',
      '^FO30,50^BY2,2.5,50',
      '^BCN,80,Y,N,N',
      `^FD${cleanBarcode}^FS`,
      `^FO50,200^A1N,35,35^FDالعميل: ${client} | الموديل: ${model}^FS`,
      `^FO50,270^A1N,35,35^FDاللون: ${color} | الكمية: ${qty} | المقاس: ${size}^FS`,
      `^FO50,340^A1N,35,35^FDالطبقات: ${layersStr} | PO: ${po}^FS`,
      '^PQ1',
      '^XZ',
    ].join('\r\n');
  }

  private async loadSecondDegreeArabicFragment(): Promise<string> {
    if (this.secondDegreeArabicFragment !== undefined) {
      return this.secondDegreeArabicFragment;
    }
    try {
      const { data } = await api.get<{ fragment: string }>('/barcodes/zpl/second-degree-arabic-graphic');
      this.secondDegreeArabicFragment = data?.fragment ?? '';
    } catch (e) {
      console.warn('Could not load Arabic ZPL fragment for second-degree label', e);
      this.secondDegreeArabicFragment = '';
    }
    return this.secondDegreeArabicFragment;
  }

  async printBarcode(barcodeData: BarcodePrintData, printerName?: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const targetPrinter = printerName || this.defaultPrinter?.name;
        
        if (!targetPrinter) {
          reject(new Error('No printer selected'));
          return;
        }

        let arabic = '';
        if (barcodeData.is_second_degree) {
          arabic = await this.loadSecondDegreeArabicFragment();
        }
        let zplCode = this.generateZPL(barcodeData, arabic);
        zplCode = zplCode.replace(/\r?\n/g, '\r\n').trimStart();
        if (barcodeData.is_second_degree) {
          console.info('[Zebra] second-degree print', {
            zplChars: zplCode.length,
            arabicFragmentChars: arabic.length,
          });
        }
        if (!zplCode.startsWith('^XA')) {
          console.error('[Zebra] ZPL must start with ^XA; got:', zplCode.slice(0, 120));
        }

        const bp = this.getBp();
        const mode = this.browserPrintMode;
        if (!mode) {
          reject(new Error('Zebra Browser Print is not initialized yet.'));
          return;
        }

        if (mode === 'legacy') {
          if (!bp.send) {
            reject(new Error('BrowserPrint.send not available'));
            return;
          }
          bp.send(targetPrinter, zplCode, (response) => {
            if (response.success) {
              if (!response.data && response.error) {
                console.warn('[Zebra] success=true but check error field:', response);
              }
              resolve(true);
            } else {
              console.error('[Zebra] BrowserPrint failed:', response);
              reject(new Error(response.error || 'Failed to print'));
            }
          });
          return;
        }

        let device = this.v3DevicesByName.get(targetPrinter);
        if (!device) {
          await this.getAvailablePrinters();
          device = this.v3DevicesByName.get(targetPrinter);
        }
        if (!device) {
          reject(new Error(`Printer not found for Browser Print: ${targetPrinter}`));
          return;
        }

        device.send(
          zplCode,
          () => resolve(true),
          (err) => {
            console.error('[Zebra] BrowserPrint device.send failed:', err);
            reject(new Error(err || 'Failed to print'));
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  async printMultipleBarcodes(barcodeDataList: BarcodePrintData[], printerName?: string, count: number = 1): Promise<boolean> {
    try {
      const targetPrinter = printerName || this.defaultPrinter?.name;
      
      if (!targetPrinter) {
        throw new Error('No printer selected');
      }

      for (const barcodeData of barcodeDataList) {
        for (let i = 0; i < count; i++) {
          await this.printBarcode(barcodeData, targetPrinter);
        }
      }

      return true;
    } catch (error) {
      console.error('Error printing multiple barcodes:', error);
      throw error;
    }
  }

  getServiceStatus(): { ready: boolean; defaultPrinter: ZebraPrinter | null; availablePrinters: ZebraPrinter[] } {
    return {
      ready: this.isServiceReady,
      defaultPrinter: this.defaultPrinter,
      availablePrinters: this.availablePrinters
    };
  }
}

export const zebraPrinterService = new ZebraPrinterService();
export type { ZebraPrinter, BarcodePrintData };
