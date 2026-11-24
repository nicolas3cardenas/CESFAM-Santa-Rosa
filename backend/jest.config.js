'use strict';
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  setupFiles: ['<rootDir>/test/ayudas/entorno.js'],
  testTimeout: 30000,
  maxWorkers: 1,                       // las pruebas de integración comparten una base de datos: una a la vez
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageDirectory: 'resultados/cobertura'
};
