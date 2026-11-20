# PublicBot Backend Gemini

API backend para el asistente virtual público del SENA, orientado a responder preguntas sobre certificación de competencias laborales. El servicio está construido con NestJS y TypeScript, integra Google Gemini y utiliza MongoDB Atlas Vector Search para recuperar información contextual.

## Contenido

- [Descripción general](#descripción-general)
- [Funciones principales](#funciones-principales)
- [Tecnologías](#tecnologías)
- [Requisitos](#requisitos)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Configuración](#configuración)
- [API](#api)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Comandos disponibles](#comandos-disponibles)

## Descripción general

PublicBot implementa un flujo de generación aumentada por recuperación (RAG). Divide e indexa documentos, genera embeddings con Gemini, busca fragmentos relevantes en MongoDB Atlas y construye respuestas con el modelo generativo activo. La API también administra usuarios, autenticación, prompts, respuestas, reseñas y la configuración del modelo.

La documentación interactiva de los endpoints se publica con Swagger en `/docs`.

## Funciones principales

- **Consultas RAG:** respuestas sobre la información indexada, con opción de recibir la generación en tiempo real mediante Server-Sent Events (SSE).
- **Búsqueda contextual:** recuperación vectorial en MongoDB Atlas y reordenamiento híbrido que combina similitud semántica y coincidencia léxica.
- **Caché de contexto:** conserva temporalmente resultados de recuperación en memoria para acelerar consultas repetidas.
- **Gestión de documentos vectoriales:** indexación con fragmentación y metadatos, carga individual o masiva, búsqueda, consulta de estadísticas y operaciones de mantenimiento.
- **Integración con Gemini:** generación de texto y embeddings mediante la API de Google. La lista de modelos generativos disponibles está controlada por el backend.
- **Selección dinámica del modelo:** un administrador puede consultar y cambiar el modelo generativo activo; la selección se guarda en MongoDB.
- **Autenticación por código OTP:** envío de códigos de verificación por correo y emisión de tokens JWT. También existe un endpoint de inicio de sesión con contraseña marcado como obsoleto en la API.
- **Administración de contenido y usuarios:** módulos para usuarios, prompts, respuestas y reseñas.
- **Seguridad y operación:** encabezados de seguridad con Helmet, validación y transformación de solicitudes, control de acceso por JWT y roles, límite global de solicitudes, registro de peticiones y métricas compatibles con Prometheus.

## Tecnologías

| Tecnología | Uso |
|---|---|
| NestJS y TypeScript | Aplicación modular y API REST |
| Google Gen AI SDK | Generación de respuestas y embeddings con Gemini |
| LangChain | Integración RAG, fragmentación de texto y almacenamiento vectorial |
| MongoDB Atlas y Mongoose | Persistencia de vectores, usuarios, contenido y configuración |
| Redis | Lista de revocación de tokens JWT al cerrar sesión |
| Nodemailer | Envío de códigos OTP mediante SMTP |
| Swagger | Documentación interactiva de la API |
| Prometheus | Exposición de métricas HTTP |

## Requisitos

- Node.js y npm compatibles con las versiones de NestJS y TypeScript del proyecto.
- MongoDB Atlas con Vector Search habilitado y colecciones e índices preparados para las dimensiones configuradas.
- Una clave de Google AI Studio para habilitar Gemini.
- Un servidor SMTP configurado para enviar códigos OTP.
- Redis para que la invalidación de tokens al cerrar sesión esté disponible.

La aplicación puede iniciar aunque Gemini no esté configurado, pero las funciones de generación y embeddings no estarán disponibles. Redis también tiene reintentos limitados; si no se conecta, la invalidación de tokens queda degradada.

## Instalación y ejecución

```bash
git clone https://github.com/Unidad-de-Servicios-Tecnologicos/sena-tic-act-2026-pb04-backend-gemini.git
cd sena-tic-act-2026-pb04-backend-gemini
npm install
```

Copia `.env.example` como `.env` y completa los valores para tus servicios. En PowerShell:

```powershell
Copy-Item .env.example .env
```

Inicia el servidor en modo desarrollo:

```bash
npm run start:dev
```

Para compilar e iniciar la versión de producción:

```bash
npm run build
npm run start:prod
```

Con la configuración de ejemplo, el servidor escucha en `http://localhost:3222`. La ruta `/docs` muestra Swagger; `/status` permite comprobar que la API responde.

## Configuración

Usa [.env.example](./.env.example) como referencia y reemplaza los valores de ejemplo. Variables principales:

| Variable | Propósito |
|---|---|
| `PORT` | Puerto HTTP de la API; el valor de ejemplo es `3222`. |
| `NODE_ENV` | Entorno de ejecución. |
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS, separados por comas. |
| `JWT_SECRET` | Secreto para firmar y validar tokens JWT. Debe ser único y seguro fuera del entorno local. |
| `OTP_EXPIRATION_MINUTES` | Vigencia del código de verificación. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | Conexión SMTP y remitente para los correos OTP. |
| `MONGODB_ATLAS_URI` | Cadena de conexión de MongoDB Atlas. |
| `MONGODB_ATLAS_DB_NAME` | Base de datos de la aplicación. |
| `MONGODB_ATLAS_COLLECTION_NAME` | Colección vectorial utilizada por el flujo RAG. |
| `MONGODB_ATLAS_LOCAL_COLLECTION_NAME` | Colección utilizada por las operaciones de gestión y búsqueda de vectores. |
| `GEMINI_API_KEY` | Clave de Google AI Studio. También se admite `GOOGLE_API_KEY`. |
| `GEMINI_DEFAULT_LLM_MODEL` | Modelo generativo inicial; el ejemplo usa `gemini-2.5-flash`. |
| `GEMINI_EMBEDDING_MODEL` | Modelo de embeddings; el ejemplo usa `gemini-embedding-001`. |
| `GEMINI_EMBEDDING_DIMENSIONS` | Dimensionalidad de salida solicitada al modelo de embeddings. |
| `VECTOR_DIMENSIONS` | Dimensionalidad configurada para la búsqueda vectorial y sus índices; debe coincidir con los vectores almacenados en Atlas. |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | Tamaño de fragmento y superposición al indexar texto. |
| `CHATBOTAI_TOP_K`, `CHATBOTAI_TOP_RERANK` | Cantidad de resultados recuperados y cantidad considerada tras el reordenamiento. |
| `CHATBOTAI_TEMPERATURA`, `CHATBOTAI_MAX_TOKENS` | Parámetros de generación de respuestas. |
| `REDIS_HOST`, `REDIS_PORT` | Dirección de Redis para la lista de revocación de tokens. |

El flujo RAG utiliza el índice vectorial `vector_index`. Configura en Atlas los índices necesarios para las colecciones y dimensiones que indique tu entorno. No publiques el archivo `.env`, claves API, credenciales SMTP, secretos JWT ni cadenas de conexión reales.

## API

Swagger es la referencia más completa para los parámetros, cuerpos de solicitud y respuestas:

```text
http://localhost:3222/docs
```

### Rutas principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Mensaje de bienvenida. |
| `GET` | `/status` | Estado básico de disponibilidad. |
| `GET` | `/health` | Estado detallado del proceso; requiere JWT. |
| `GET` | `/usage` | Uso de memoria y CPU del proceso; requiere JWT. |
| `GET` | `/metrics` | Métricas HTTP para Prometheus. |
| `GET` | `/auth/mail-status` | Diagnóstico de la conexión de correo. |
| `POST` | `/auth/request-otp` | Solicita el envío de un código OTP. |
| `POST` | `/auth/verify-otp` | Verifica el código y devuelve un JWT. |
| `POST` | `/auth/login` | Inicio de sesión con contraseña, conservado como endpoint obsoleto. |
| `POST` | `/auth/logout` | Cierra la sesión e intenta revocar el JWT; requiere JWT y Redis disponible para persistir la revocación. |
| `POST` | `/rag/ask` | Envía una consulta al flujo RAG. |
| `POST` | `/rag/ask-stream` | Envía una consulta y transmite la respuesta como SSE. |
| `GET` | `/rag/health` | Comprueba el estado del servicio RAG. |
| `GET` | `/rag/info` | Informa el modelo activo y detalles del servicio RAG. |
| `POST` | `/rag/add-text` | Indexa texto y metadatos; requiere JWT. |
| `POST` | `/rag/create-index` | Crea el índice vectorial del flujo RAG; requiere JWT. |
| `GET`, `POST`, `PATCH`, `DELETE` | `/users`, `/prompts`, `/answers`, `/reviews` | Operaciones de administración de los recursos correspondientes. |
| `GET` | `/llm/models` | Consulta modelos disponibles y configuración activa; requiere JWT y rol `Administrador`. |
| `GET`, `PATCH` | `/llm/active` | Consulta o cambia el modelo generativo activo; requiere JWT y rol `Administrador`. |

La gestión de vectores está disponible bajo `/localvectors`: incluye indexación de texto, carga individual o masiva, búsqueda, estadísticas, consulta por identificador y operaciones de actualización y eliminación. Consulta Swagger antes de exponer estas rutas públicamente y para ver los métodos y parámetros exactos.

El límite global configurado es de 120 solicitudes por minuto. El flujo de respuestas RAG y la búsqueda de vectores dependen de que Gemini, MongoDB Atlas y los índices correspondientes estén disponibles.

## Estructura del proyecto

```text
src/
├── auth/             Autenticación OTP/JWT, correo y control de roles
├── users/            Gestión de usuarios
├── localrag/         Consultas RAG y flujo de respuestas
├── gemini/           Generación de texto y embeddings con Gemini
├── database/         Conexión y esquemas de MongoDB
├── vectorstorelocal/ Gestión y búsqueda de vectores
├── llm-settings/     Selección del modelo generativo activo
├── prompts/          Gestión de prompts
├── answers/          Gestión de respuestas
├── reviews/          Gestión de reseñas
├── metrics/          Métricas de solicitudes y errores
└── common/           Filtros y componentes compartidos
```

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run start` | Inicia la aplicación. |
| `npm run start:dev` | Inicia en desarrollo con recarga automática. |
| `npm run start:debug` | Inicia en desarrollo con depurador. |
| `npm run build` | Compila la aplicación en `dist/`. |
| `npm run start:prod` | Inicia la aplicación compilada. |
| `npm run lint` | Ejecuta ESLint y aplica correcciones automáticas. |
| `npm run format` | Formatea los archivos TypeScript de `src/` y `test/`. |
| `npm run test` | Ejecuta las pruebas unitarias con Jest. |
| `npm run test:watch` | Ejecuta las pruebas en modo de observación. |
| `npm run test:cov` | Ejecuta las pruebas y genera cobertura. |
| `npm run test:e2e` | Ejecuta las pruebas de extremo a extremo. |
| `npm run migrate:embeddings` | Ejecuta el proceso de migración de embeddings a Gemini. |
