interface ZebraPrinter {
  name: string;
  connectionType: string;
}

interface ZebraResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface BarcodePrintData {
  barcode: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  quantity: number;
  layers: number;
  serial?: number;
}

declare global {
  interface Window {
    BrowserPrint: {
      getDefaultPrinter: (callback: (response: ZebraResponse) => void) => void;
      getPrinters: (callback: (response: ZebraResponse) => void) => void;
      setDefaultPrinter: (printerName: string, callback: (response: ZebraResponse) => void) => void;
      send: (printerName: string, printData: string, callback: (response: ZebraResponse) => void) => void;
      isServiceAvailable: (callback: (response: ZebraResponse) => void) => void;
    };
  }
}

class ZebraPrinterService {
  private isServiceReady = false;
  private defaultPrinter: ZebraPrinter | null = null;
  private availablePrinters: ZebraPrinter[] = [];

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window.BrowserPrint === 'undefined') {
        reject(new Error('Zebra Browser Print service is not available. Please install Zebra Browser Print software.'));
        return;
      }

      window.BrowserPrint.isServiceAvailable((response) => {
        if (response.success && response.data?.available) {
          this.isServiceReady = true;
          resolve();
        } else {
          reject(new Error('Zebra Browser Print service is not running. Please start the service.'));
        }
      });
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
    return new Promise((resolve, reject) => {
      if (!this.isServiceReady) {
        reject(new Error('Service not ready'));
        return;
      }

      window.BrowserPrint.getPrinters((response) => {
        if (response.success && response.data) {
          this.availablePrinters = response.data;
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Failed to get printers'));
        }
      });
    });
  }

  async getDefaultPrinter(): Promise<ZebraPrinter | null> {
    return new Promise((resolve, reject) => {
      if (!this.isServiceReady) {
        reject(new Error('Service not ready'));
        return;
      }

      window.BrowserPrint.getDefaultPrinter((response) => {
        if (response.success && response.data) {
          this.defaultPrinter = response.data;
          resolve(response.data);
        } else {
          resolve(null);
        }
      });
    });
  }

  async setDefaultPrinter(printerName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.isServiceReady) {
        reject(new Error('Service not ready'));
        return;
      }

      window.BrowserPrint.setDefaultPrinter(printerName, (response) => {
        if (response.success) {
          this.defaultPrinter = { name: printerName, connectionType: 'USB' };
          resolve(true);
        } else {
          reject(new Error(response.error || 'Failed to set default printer'));
        }
      });
    });
  }

  generateZPL(barcodeData: BarcodePrintData): string {
    const cleanText = (text: string): string => {
      if (!text) return '';
      return text.replace(/[\n\r\t]/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
    };

    const textInfo = cleanText(`Client: ${barcodeData.brand} | Model: ${barcodeData.model}`);
    const textInfo2 = cleanText(`Color: ${barcodeData.color} | Qty: ${barcodeData.quantity} | Size: ${barcodeData.size}`);
    const cleanBarcode = cleanText(barcodeData.barcode);

    return `^XA
^FO50,50^BY2,2.5,50
^BCN,80,Y,N,N
^FD${cleanBarcode}^FS
^FO50,210^A0N,35,35^FD${textInfo}^FS
^FO50,300^A0N,35,35^FD${textInfo2}^FS
^FO675,225^GB50,50,5^FS
^FO685,200^A0N,20,20^FD2nd^FS
^XZ`;
  }

  async printBarcode(barcodeData: BarcodePrintData, printerName?: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const targetPrinter = printerName || this.defaultPrinter?.name;
        
        if (!targetPrinter) {
          reject(new Error('No printer selected'));
          return;
        }

        const zplCode = this.generateZPL(barcodeData);

        window.BrowserPrint.send(targetPrinter, zplCode, (response) => {
          if (response.success) {
            resolve(true);
          } else {
            reject(new Error(response.error || 'Failed to print'));
          }
        });
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
