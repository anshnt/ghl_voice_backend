function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta = undefined) {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  process.stdout.write(`[${level}] ${timestamp()} ${message}${suffix}\n`);
}

export const logger = {
  info(message, meta) {
    write('INFO', message, meta);
  },
  warn(message, meta) {
    write('WARN', message, meta);
  },
  error(message, meta) {
    write('ERROR', message, meta);
  }
};
