import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

class BarcodeService {
    static validationRules = {
        modelName: {
            minLength: 1,
            pattern: /^[a-zA-Z0-9]+$/,
            message: "Model name must be at least 1 alphanumeric character."
        },
        quantity: {
            min: 1,
            max: 999,
            message: "Quantity must be between 1-999."
        },
        layers: {
            min: 1,
            max: 99,
            message: "Layers must be between 1-99."
        },
        serial: {
            min: 1,
            max: 999,
            message: "Serial must be between 1-999."
        }
    };

    static validateRow(row) {
        const errors = [];
        const modelName = this.formatModelName(row.model);

        if (!this.validationRules.modelName.pattern.test(modelName) || 
            modelName.length < this.validationRules.modelName.minLength) {
            errors.push(this.validationRules.modelName.message);
        }

        const quantity = parseInt(row.quantity);
        const layers = parseInt(row.layers);
        const serial = parseInt(row.serial);

        if (isNaN(quantity) || quantity < this.validationRules.quantity.min || 
            quantity > this.validationRules.quantity.max) {
            errors.push(this.validationRules.quantity.message);
        }

        if (isNaN(layers) || layers < this.validationRules.layers.min || 
            layers > this.validationRules.layers.max) {
            errors.push(this.validationRules.layers.message);
        }

        if (isNaN(serial) || serial < this.validationRules.serial.min || 
            serial > this.validationRules.serial.max) {
            errors.push(this.validationRules.serial.message);
        }

        return {
            isValid: errors.length === 0,
            errors,
            formattedData: {
                ...row,
                model: modelName,
                quantity,
                layers,
                serial
            }
        };
    }

    // Format model name according to rules
    static formatModelName(modelName) {
        if (!modelName) return '';
        
        let formatted = String(modelName).trim();
        
        // Handle numeric model names
        if (formatted.replace(".", "").match(/^\d+$/)) {
            formatted = String(parseInt(parseFloat(formatted)));
        }
        
        // Keep only alphanumeric characters
        formatted = formatted.replace(/[^a-zA-Z0-9]/g, '');
        
        return formatted;
    }

    // Process Excel/CSV file
    static async processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    let data;
                    if (file.name.endsWith('.csv')) {
                        const result = Papa.parse(e.target.result, {
                            header: true,
                            skipEmptyLines: true
                        });
                        data = result.data;
                    } else {
                        const workbook = XLSX.read(e.target.result, { type: 'binary' });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        data = XLSX.utils.sheet_to_json(worksheet);
                    }

                    const processedData = [];
                    const errors = [];

                    data.forEach((row, index) => {
                        const validation = this.validateRow(row);
                        if (validation.isValid) {
                            processedData.push(validation.formattedData);
                        } else {
                            errors.push({
                                row: index + 1,
                                data: row,
                                errors: validation.errors
                            });
                        }
                    });

                    resolve({ processedData, errors });
                } catch (error) {
                    reject(new Error('Error processing file: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('Error reading file'));

            if (file.name.endsWith('.csv')) {
                reader.readAsText(file);
            } else {
                reader.readAsBinaryString(file);
            }
        });
    }

    // Generate barcode image
    static generateBarcodeImage(barcode) {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode, {
            format: "CODE128",
            width: 2,
            height: 100,
            displayValue: true
        });
        return canvas;
    }

    // Print barcode
    static async printBarcode(data) {
        const printWindow = window.open('', '_blank');
        const barcodeCanvas = this.generateBarcodeImage(data.barcode);
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print Barcode</title>
                    <style>
                        @media print {
                            body { margin: 0; }
                            .barcode-container {
                                text-align: center;
                                padding: 20px;
                                page-break-after: always;
                            }
                            .info {
                                font-size: 14px;
                                margin: 10px 0;
                            }
                            .barcode-image {
                                max-width: 100%;
                                height: auto;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="barcode-container">
                        <div class="info">Brand: ${data.brand} | Model: ${data.model}</div>
                        <div class="info">Color: ${data.color} | Qty: ${data.quantity} | Size: ${data.size}</div>
                        <img class="barcode-image" src="${barcodeCanvas.toDataURL()}" />
                    </div>
                </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // Wait for images to load
        await new Promise(resolve => {
            const images = printWindow.document.getElementsByTagName('img');
            let loadedImages = 0;
            
            for (let img of images) {
                if (img.complete) {
                    loadedImages++;
                    if (loadedImages === images.length) resolve();
                } else {
                    img.onload = () => {
                        loadedImages++;
                        if (loadedImages === images.length) resolve();
                    };
                }
            }
        });
        
        printWindow.print();
        printWindow.close();
    }

    // Print multiple barcodes
    static async printBulkBarcodes(dataList) {
        const printWindow = window.open('', '_blank');
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print Barcodes</title>
                    <style>
                        @media print {
                            body { margin: 0; }
                            .barcode-container {
                                text-align: center;
                                padding: 20px;
                                page-break-after: always;
                            }
                            .info {
                                font-size: 14px;
                                margin: 10px 0;
                            }
                            .barcode-image {
                                max-width: 100%;
                                height: auto;
                            }
                        }
                    </style>
                </head>
                <body>
        `);

        for (const data of dataList) {
            const barcodeCanvas = this.generateBarcodeImage(data.barcode);
            printWindow.document.write(`
                <div class="barcode-container">
                    <div class="info">Brand: ${data.brand} | Model: ${data.model}</div>
                    <div class="info">Color: ${data.color} | Qty: ${data.quantity} | Size: ${data.size}</div>
                    <img class="barcode-image" src="${barcodeCanvas.toDataURL()}" />
                </div>
            `);
        }

        printWindow.document.write('</body></html>');
        printWindow.document.close();
        
        // Wait for images to load
        await new Promise(resolve => {
            const images = printWindow.document.getElementsByTagName('img');
            let loadedImages = 0;
            
            for (let img of images) {
                if (img.complete) {
                    loadedImages++;
                    if (loadedImages === images.length) resolve();
                } else {
                    img.onload = () => {
                        loadedImages++;
                        if (loadedImages === images.length) resolve();
                    };
                }
            }
        });
        
        printWindow.print();
        printWindow.close();
    }
}

export default BarcodeService; 