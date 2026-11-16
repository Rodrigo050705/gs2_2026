// Base da API. Relativa por padrão: em dev o Vite repassa /api para http://127.0.0.1:8000
// (vite.config.js) e no container o nginx repassa para o serviço da API (nginx.conf).
// Assim o mesmo build serve hml e prod. VITE_API_URL só é necessário para apontar
// o front para uma API em outro endereço.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";
