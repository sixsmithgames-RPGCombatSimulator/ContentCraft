/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private enabled: boolean = true;

  private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.enabled) return;

    const entry = this.formatMessage(level, message, data);
    const output = data
      ? `[${entry.timestamp}] ${level.toUpperCase()}: ${message} ${JSON.stringify(data)}`
      : `[${entry.timestamp}] ${level.toUpperCase()}: ${message}`;

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'debug':
        console.debug(output);
        break;
    }
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  disable(): void {
    this.enabled = false;
  }

  enable(): void {
    this.enabled = true;
  }
}

export const logger = new Logger();
