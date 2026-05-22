# AI QUE BONITO

## CONTEXTO
* Esta es una aplicación que se desarrollará en tiempo real en frente de una audiencia en un evento de Google Cloud llamado AI Live Madrid
* El propósito de esta aplicación es mostrar el funcionamiento de la nueva versión de Antigravity
* El alcance de esta aplicación va a consistir en recoger datos (prompts) que los asistentes habrán dejado por medio de otra aplicación en una colleción de Firestore y llamar a Gemini para convertir esos prompts en imágenes y mostrar el resultado en una galería para que la gente pueda votar los contenidos generados para que se pueda dar un premio a la persona con el prompt que haya generado la imagen más votada

### PROCESADO DE IMÁGENES (Cloud Functions, Gemini API, Firestore, Cloud Storage)
* **Configuración de entorno:** Se debe crear un archivo `.npmrc` con el contenido `registry=https://registry.npmjs.org/` en todos los directorios de Cloud Functions que se hagan. Esto evita que al utilizar un portátil corporativo el `package-lock.json` apunte a registros privados y falle el despliegue.
* Esta parte servidora tiene que registrar un trigger en Firestore que se dispare cuando se inserte un nuevo prompt en la colección prompts
* El esquema de la colección prompts es el siguiente:
comment: "Una imagen que capta la esencia del trabajo duro y la diplomacia corporativa. Seguro que los modelos de IA se sentirán muy identificados con esta profunda expresión artística."
(string) 
createdAt: May 21, 2026 at 1:59:21.712 PM UTC+2
(timestamp) 
imageUrl: "https://storage.googleapis.com/aiquebonito/1ojixjUsv3kqx4B5trDe.png"
(string) 
processedAt: May 21, 2026 at 1:59:35.783 PM UTC+2
(timestamp) 
promptText: "Un equipo de preventas de una empresa tecnológica haciendo lo que mejor saben beber cerveza"
(string) 
status: "completed"
(string) 
userCode: "AILIVE-WO4N"
(string) 
userId: "ay9qx0gdzHSfqcSWmpa0"
(string) 
username: "Pepe Luis"
(string) 
votes: 1
* En cada trigger se hará una transacción (para evitar race conditions) donde se recoja el documento que origina el trigger y todos los documentos que estén por procesar en la colección. En ella se actualizará el campo status a "in-progress" y el campo processedAt con la fecha actual.
* Para generar la imagen, el modelo al que se llame será "gemini-3.1-flash-image-preview" (Nanobanana 2) y se deberá llamar con las librerías de Google Gen AI SDK
* En la medida de lo posible se deberán paralelizar hasta 5 peticiones (siendo esto configurable)
* Una vez generada, almacenará la misma en un bucket público llamado "aiquebonito" y se actualizará el documento de Firestore con la ruta
