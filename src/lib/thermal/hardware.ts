/**
 * Direct Web Hardware Integration for Thermal Printers:
 * 1. Web Serial API (USB Virtual COM / RS232)
 * 2. Web Bluetooth API (BLE / SPP POS Printers)
 */

import type { ThermalPrintResult } from "./types";

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Send raw byte payload directly to thermal printer via Web Serial API (USB)
 */
export async function printViaWebSerial(
  data: Uint8Array,
  baudRate: number = 9600
): Promise<ThermalPrintResult> {
  if (!isWebSerialSupported()) {
    throw new Error(
      "Web Serial API nije podržan u ovom pregledaču. Koristite Chrome, Edge ili Opera pregledač."
    );
  }

  let port: any = null;
  try {
    // Prompt user to pick USB / COM device
    port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate });

    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();

    // Give printer time to empty hardware buffer before closing port
    await new Promise((res) => setTimeout(res, 300));
    await port.close();

    return {
      success: true,
      bytesSent: data.byteLength,
      message: `Uspešno poslato ${data.byteLength} bajtova na USB termalni štampač.`,
    };
  } catch (err) {
    if (port && port.readable) {
      try {
        await port.close();
      } catch {
        // ignore close errors
      }
    }
    const errorMsg = (err as Error).message || String(err);
    if (errorMsg.includes("cancelled") || errorMsg.includes("selected")) {
      return { success: false, message: "Izbor štampača je otkazan." };
    }
    throw new Error(`Greška pri USB štampi: ${errorMsg}`);
  }
}

/**
 * Common Bluetooth Serial & POS Printer GATT Service / Characteristic UUIDs
 */
const COMMON_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Common POS printer service
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip Transparent UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Feasycom BLE SPP
  "0000fff0-0000-1000-8000-00805f9b34fb", // Generic POS vendor service
];

/**
 * Send raw byte payload directly to thermal printer via Web Bluetooth API
 */
export async function printViaWebBluetooth(
  data: Uint8Array
): Promise<ThermalPrintResult> {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      "Web Bluetooth API nije podržan u ovom pregledaču. Koristite Chrome / Android pregledač sa omogućenim Bluetooth-om."
    );
  }

  let device: any = null;
  try {
    // Request Bluetooth device
    device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        { namePrefix: "POS" },
        { namePrefix: "MPT" },
        { namePrefix: "RPP" },
        { namePrefix: "Printer" },
        { namePrefix: "MTP" },
        { namePrefix: "InnerPrinter" },
        { namePrefix: "BlueTooth" },
      ],
      optionalServices: COMMON_PRINTER_SERVICES,
    }).catch(async () => {
      // Fallback: acceptAllDevices if named filters did not match
      return await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_PRINTER_SERVICES,
      });
    });

    if (!device || !device.gatt) {
      return { success: false, message: "Bluetooth uređaj nije izabran." };
    }

    const server = await device.gatt.connect();

    // Search through supported services to find a writable characteristic
    let writeChar: any = null;

    for (const serviceUuid of COMMON_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            writeChar = ch;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Continue to next service candidate
      }
    }

    if (!writeChar) {
      throw new Error(
        "Nije pronađena odgovarajuća servisna karakteristika za štampu na ovom Bluetooth uređaju."
      );
    }

    // Split data into BLE safe chunks (max 100 bytes per chunk to avoid packet drops)
    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const slice = data.slice(offset, offset + CHUNK_SIZE);
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(slice);
      } else {
        await writeChar.writeValue(slice);
      }
      // Brief pause between BLE frames
      await new Promise((res) => setTimeout(res, 25));
    }

    // Disconnect after sending
    setTimeout(() => {
      if (device.gatt.connected) {
        device.gatt.disconnect();
      }
    }, 1000);

    return {
      success: true,
      bytesSent: data.byteLength,
      message: `Uspešno odštampano preko Bluetooth-a (${data.byteLength} bajtova).`,
    };
  } catch (err) {
    if (device && device.gatt && device.gatt.connected) {
      try {
        device.gatt.disconnect();
      } catch {
        // ignore
      }
    }
    const errorMsg = (err as Error).message || String(err);
    if (errorMsg.includes("User cancelled") || errorMsg.includes("cancelled")) {
      return { success: false, message: "Povezivanje preko Bluetooth-a je otkazano." };
    }
    throw new Error(`Bluetooth greška: ${errorMsg}`);
  }
}
