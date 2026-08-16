function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level.padEnd(5)} ${message}`;
  if (level === 'ERROR') {
    console.error(line, ...args);
  } else if (level === 'WARN') {
    console.warn(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    write('INFO', message, args);
  },
  warn(message: string, ...args: unknown[]): void {
    write('WARN', message, args);
  },
  error(message: string, ...args: unknown[]): void {
    write('ERROR', message, args);
  },
};
