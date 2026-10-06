# Calculadora de aspersión para drones

Herramienta web gratuita y de código abierto, hecha por **Datos de Occidente** (Cali, Colombia), para operadores y técnicos de drones pulverizadores. Con los datos de la labor calcula:

- Litros totales de mezcla, hectáreas por carga y número de cargas (tanqueadas), incluida la última carga parcial.
- Producto por carga, en la última carga y total, para cada producto de la mezcla (hasta 8).
- Agua por carga (cuando todos los productos son líquidos).
- Costo total y costo por hectárea (opcional).
- Tiempo estimado de labor (opcional).

Funciona en el celular, sin internet, sin cuentas y sin instalar nada.

## Cómo usar

1. Descarga o clona el repositorio.
2. Abre `index.html` con doble clic (funciona desde `file://`).
3. Llena área, capacidad útil del tanque y volumen de aplicación. Los resultados se actualizan mientras escribes.
4. Usa **Copiar resumen** (texto plano listo para WhatsApp) o **Imprimir / guardar PDF**.

Detalles de las entradas:

- Decimales con coma o punto (`1,5` o `1.5`). No uses separador de miles (`40000`, no `40.000`).
- El área puede ir en hectáreas o en plazas/fanegadas (6.400 m² = 0,64 ha).
- El volumen se ingresa directo en L/ha o se calcula con caudal, velocidad (km/h o m/s) y ancho de faja.
- Las dosis van por hectárea en L/ha, mL/ha (cc/ha), kg/ha o g/ha.

## Fórmulas

| Resultado | Fórmula |
|---|---|
| L/ha (modo caudal) | 600 × caudal (L/min) ÷ (velocidad (km/h) × ancho de faja (m)); m/s × 3,6 = km/h |
| Mezcla total (L) | área (ha) × L/ha |
| Hectáreas por carga | capacidad del tanque (L) ÷ L/ha |
| Cargas | mezcla total ÷ capacidad del tanque, redondeado hacia arriba (con tolerancia 1e-9) |
| Producto por carga | dosis (L/ha o kg/ha) × hectáreas por carga |
| Producto total | dosis × área |
| Agua por carga | capacidad − productos líquidos por carga (no se calcula si hay kg o g) |
| Costo de producto | producto total × precio por L o kg |
| Costo por ha | (productos + operación por ha × área) ÷ área |
| Capacidad de campo teórica (ha/h) | velocidad (km/h) × ancho de faja (m) ÷ 10 |
| Tiempo estimado (h) | área ÷ (capacidad teórica × eficiencia ÷ 100) |

mL y g se convierten a L y kg. Se calcula con precisión completa y solo se redondea al mostrar.

## Pruebas

Requiere Node.js 18 o superior. Sin dependencias.

```bash
node --test
```

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub.
2. En **Settings → Pages**, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. La app queda en `https://USUARIO.github.io/calculadora-aspersion-drones/`.
4. Pon esa URL y los demás enlaces en `js/config.js` (los valores `TODO_CONFIGURAR` no se muestran).

## Estructura

```
index.html        Página
css/styles.css    Estilos (incluye hoja de impresión)
js/calc.js        Lógica pura, sin DOM (UMD: window.Calc / module.exports)
js/ui.js          DOM, eventos y presentación
js/config.js      Marca, moneda y enlaces de contacto (editable)
tests/            Pruebas con node --test
```

## Contribuir

Se reciben reportes y mejoras por *issues* y *pull requests*. Reglas:

- JavaScript sin dependencias ni frameworks, scripts clásicos (sin `type="module"`).
- Toda lógica nueva va en `calc.js` con su prueba en `tests/`.
- Nunca insertes texto del usuario con `innerHTML`.
- No se aceptan recomendaciones de dosis, listas de productos comerciales ni afirmaciones regulatorias.

## Privacidad

Todo se calcula en tu dispositivo. La app no hace peticiones de red, no usa cookies, ni analítica, ni almacenamiento local, y no envía tus datos a ningún lado. Una política de seguridad de contenido (CSP) bloquea cualquier recurso externo.

## Aviso legal

Herramienta de apoyo con fines informativos. Verifica siempre dosis y compatibilidad con la etiqueta del producto, un ingeniero agrónomo y la normativa aplicable. Sin garantía de ningún tipo.

## Otras herramientas de Datos de Occidente

Gratuitas y de código abierto; los enlaces aparecen también dentro de la app (pie de página y en el paso donde son útiles).

- [Registro de aspersión](https://cmr911.github.io/registro-aspersion-drones/): guarda cada aplicación y entrega una constancia al cliente.
- [Lector de bitácoras de vuelo](https://cmr911.github.io/lector-bitacoras-drones/): convierte la exportación de vuelos del dron en un reporte imprimible.

## Licencia

[MIT](LICENSE) © Datos de Occidente
