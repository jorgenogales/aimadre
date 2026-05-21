# AIMadre Prompter
- AIMadre Prompter será una aplicación web cuyo objetivo será permitir que usuarios puedan introducir prompts que una vez vetados y aprobados por Gemini 3.5 y comentados de manera sarcástica, se almacenen en una base de datos para su posterior consulta.
- Esta aplicación se mostrará en un evento de Google Cloud donde en tiempo real se procesarán los prompts que vayan llegando para generar un contenido
- Tanto la generación del contenido como el procesado de los prompts se hará en una aplicación diferente
- El prompt, junto con el usuario se almacenará en una colección de Firestore
- AIMadre Prompter notificará mediante triggers de Firestore a la aplicación de generación de contenido el hecho de que existe un nuevo prompt para procesar

## User flows

### Alta/Identificación de usuario
- Dado que el objetivo de esta presentación es obtener un ganador de contenido más relevante generado con un prompt, necesitamos hacer que el usuario se pueda identificar
- Cuando un usuario se da de alta para participar se le tiene que dar un código único que, de resultar ganador, permita su validación

### Usuario sube un prompt
- Pasado el proceso de alta/identificación el usuario tendrá una pantalla donde pueda introducir un determinado prompt de manera fácil
- Cuando el usuario envía el prompt, habrá una parte servidora (Cloud Function?) que utilice Gemini 3.5 flash para validar que el prompt es compliant
- Cuando el prompt es aprobado, dentro de la misma función se almacena en base de datos y se envía como respuesta un comentario sarcástico de Gemini 3.5 flash acerca del mismo prompt
- Cuando el usuario recibe la respuesta tendrá opción a enviar otro prompt y participar más veces

## Alto nivel técnico
- Será una aplicación web
- La parte estática se alojará en firebase hosting
- La parte dinámica serán cloud functions
- Como sistema de almacenamiento se utilizará Firestore. Para habilitar la posibilidad de que se hagan triggers que notifiquen de la subida de nuevos prompts


## UI Styles
- La aplicación tiene que tener el estilo de https://antigravity.google/ dado que esta aplicación va a ser una manera de mostrar ciertos conceptos de Antigravity
