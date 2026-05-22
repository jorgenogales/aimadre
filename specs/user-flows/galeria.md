# AI QUE BONITO

## CONTEXTO
* Esta es una aplicación que se desarrollará en tiempo real en frente de una audiencia en un evento de Google Cloud llamado AI Live Madrid
* El propósito de esta aplicación es mostrar el funcionamiento de la nueva versión de Antigravity
* El alcance de esta aplicación va a consistir en recoger datos (prompts) que los asistentes habrán dejado por medio de otra aplicación en una colleción de Firestore y llamar a Gemini para convertir esos prompts en imágenes y mostrar el resultado en una galería para que la gente pueda votar los contenidos generados para que se pueda dar un premio a la persona con el prompt que haya generado la imagen más votada

## USER FLOWS

### GALLERY (LANDING PAGE)
* Puedes encontrar un wireframe del diseño en el proyecto "AI Qué Bonito" de Stitch
* Será una aplicación llamada "AI Qué Bonito!" que se ejecute en Firebase Hosting
* Esta aplicación llamará a una cloud function que devuelva todos los contenidos procesados de la colección "prompts" de Firestore y muestre en una página web las imágenes definida en Backend.
* Para mostrar las imágenes se utilizará la URL pública de los contenidos del bucket
* La galería debe estar en 16:9 para mostrarse en un monitor gigante
* Debe mostrar todo el contenido en una galería que se va actualizando cada 5 segundos
* La imagen que se resalte como principal en la página será elegida aleatoriamente cada 5 segundos también
* Cada imagen debe estar sobre una tarjeta con el texto generado, el nombre del autor y el número de votos
* En la esquina inferior derecha de cada tarjeta habrá un icono de upvote con el número de votos recibidos
* Las imágenes no deben solaparse entre si
* Ante un click de la imagen se presentará en pantalla completa
* El orden de las imágenes se actualiza en función de los votos recibidos
* Debe incluir una manera de ir a la app para generar el prompt aimadre.web.app/prompter/index.html
* A igualdad de votos, se ordenará por la imagen cuyo prompt haya entrado antes, con lo que hay que mostrar esta información en el card
* 
* Cuando el usuario se loga en otra aplicación en el mismo dominio deja en el localStorage del navegador un ID. La galería tiene que comprobar que esto existe y si no es así, mostrar una tarjeta en la que se indique que se debe ir a la otra aplicación de generación de prompts para identificarse.
* IMPORTANTE: Sólo se pueden permitir 3 votos por usuario
* IMPORTANTE: El usuario puede cambiar su voto pulsando en uno de los votos que haya dado lo cual restará 1 de los votos de la imagen y sumará 1 a los votos restantes

#### BACKEND
* El backend de la galería consistirá en varias cloud functions que:
- Permitan leer las imágenes procesadas de una coleccion de Firestore llamada "prompts" con los documentos con el campo status=completed. Este es el esquema:
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
- Que permitan upvotear un prompt. Esto incrementará en 1 los votos del prompt y retirar un voto lo cual restará un voto. La modificación del número de votos en Firestore se tendrá que hacer de forma transaccional.
