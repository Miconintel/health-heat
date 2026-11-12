import 'dotenv/config';

// The e2e suite never calls the external risk engine; a placeholder key lets the app boot
// on machines that don't have the real ENGINE_API_KEY.
process.env.ENGINE_API_KEY ||= 'e2e-placeholder-key';
