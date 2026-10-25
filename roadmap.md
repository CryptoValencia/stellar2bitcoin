# Roadmap

- [ ] Revisar funcionamiento completo: cotizaciones reales, errores, wallet, pagos, historial y recuperación; corregir fallos encontrados.
- [ ] Retirar referencias visibles a Lovable sin eliminar las integraciones necesarias; revisar insignia publicada.
- [ ] Mover el acceso al historial a un icono discreto sin texto junto al cambio de tema.

- [x] Añadir pago firmado desde la wallet conectada y acceso rápido a su dirección de recepción (firma, rechazo y bloqueo de pagos repetidos probados).
- [x] Mostrar enlaces a exploradores únicamente para hashes reales del depósito y del pago (pendiente recepción de hashes de una orden real).
- [x] Añadir historial privado de swaps recientes, recuperable en este navegador (privacidad probada; recuperación de una orden real pendiente de fondos).
- [x] Añadir atajos 25%, 50% y MAX sin superar el saldo disponible.

- [x] Pulir separación del título A3 y sustituir light/dark por sol y luna.

- [x] Mostrar el mínimo real al introducir una cantidad sin cotización y comprobar recuperación con 1000 XLM.
- [x] Aplicar logo A3 con el 2 del mismo tamaño y en cursiva, sin cambiar la tipografía del swap.

- [x] Auditar cotizaciones: importes reales, caducidad, cambios de entrada y confirmación del mismo precio (19 pruebas; XLM/USDC en pantalla comprobados, orden con fondos pendiente)

- [x] Corregir comparación engañosa de valor XLM→BTC y verificar cotización real sin cifras simuladas
- [x] Revisar 100 USDC→BTC y opciones de agregación para mejorar el importe recibido

- [x] Comprobar cotización XLM→BTC sin conectar cartera

- [x] Añadir logos a las opciones de Connect wallet
- [x] Verificar tokens por proveedor y explicar integraciones pendientes

- [x] Corregir Connect wallet: autorización real, saldo real y errores claros (tests y ausencia de extensión verificados)
- [x] Integrar cotizaciones y código de órdenes SideShift según su documentación oficial
- [ ] Verificar conexión con una extensión real: requiere autorización desde el navegador del usuario
- [ ] Verificar creación y depósito de una orden real: requiere sitio publicado con IP del visitante y aprobación de fondos
- [x] Preparar ChangeNOW y guardar su clave de forma segura (conexión verificada)

- [x] Volver el título a STELLAR2BITCOIN (2 en naranja, resto blanco)
- [x] Quitar el brillo azul (teal sutil)
- [x] Quitar el pie de página (DevDrawer)
- [x] Guardar la clave de SideShift cifrada y usarla para cotizar en real (probado: 1000 XLM → 0.00210467 BTC real)
- [x] Cards: Sell/Buy → From/To
- [x] Reinventar solo el título tras rechazar las diez alternativas; conservar Space Mono en el swap
- [x] Integrar órdenes de FixedFloat y ChangeNOW (precios reales de los 3 comprobados)
- [x] Tarjeta BTC igual que la de XLM (sin brillo)
- [x] Aplicar título compacto en dos líneas con un 2 naranja como puente
- [x] Desplegable de detalles con el mínimo garantizado (minimum received) y el precio bloqueado
- [x] Tiempo: expresado como llegada a la wallet, con estimación real (no 10–30 min · 1 confirmación)
