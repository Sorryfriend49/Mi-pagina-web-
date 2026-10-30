// =====================================================================
//  GALERÍA + BOTÓN "AGREGAR IMAGEN"
//
//  - La galería se arma a partir de galeria.json.
//  - El botón para subir solo aparece en el navegador donde se conectó
//    un token de GitHub (abriendo la página con ?admin al final).
//  - Al publicar, las imágenes y el galeria.json actualizado se suben al
//    repositorio en un solo commit; GitHub Pages actualiza el sitio solo.
// =====================================================================
(() => {
    const REPO = 'Sorryfriend49/Mi-pagina-web-';
    const RAMA = 'main';
    const API = 'https://api.github.com';
    const CLAVE_TOKEN = 'frozenProject.githubToken';

    const LIMITE_SIN_TOCAR = 2 * 1024 * 1024;    // hasta 2 MB se sube el archivo tal cual
    const LIMITE_ENTRADA = 25 * 1024 * 1024;     // archivos más pesados se rechazan
    const MAX_ARCHIVOS = 10;
    const LADO_MAXIMO = 3000;                    // lado mayor si hay que recomprimir
    const LADO_MINIATURA = 600;                  // versión liviana para celular

    const grid = document.getElementById('galeriaGrid');
    const botonAgregar = document.getElementById('botonAgregar');
    const panel = document.getElementById('panelSubida');
    const vistaConectar = document.getElementById('vistaConectar');
    const vistaSubir = document.getElementById('vistaSubir');
    const campoToken = document.getElementById('campoToken');
    const botonConectar = document.getElementById('botonConectar');
    const estadoConectar = document.getElementById('estadoConectar');
    const zonaArchivos = document.getElementById('zonaArchivos');
    const campoArchivos = document.getElementById('campoArchivos');
    const textoArchivos = document.getElementById('textoArchivos');
    const previas = document.getElementById('previas');
    const campoDescripcion = document.getElementById('campoDescripcion');
    const botonPublicar = document.getElementById('botonPublicar');
    const estadoSubir = document.getElementById('estadoSubir');
    const botonDesconectar = document.getElementById('botonDesconectar');
    const botonCerrarPanel = document.getElementById('botonCerrarPanel');
    const panelEliminar = document.getElementById('panelEliminar');
    const previaEliminar = document.getElementById('previaEliminar');
    const botonCancelarEliminar = document.getElementById('botonCancelarEliminar');
    const botonConfirmarEliminar = document.getElementById('botonConfirmarEliminar');
    const estadoEliminar = document.getElementById('estadoEliminar');
    const aviso = document.getElementById('aviso');

    let archivosElegidos = [];
    let urlsPrevias = [];
    let subiendo = false;
    let eliminando = false;
    let recuadroPorEliminar = null;

    const ICONO_BASURA = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // ---------- Token (solo en este navegador) ----------
    function leerToken(){ try { return localStorage.getItem(CLAVE_TOKEN) || ''; } catch { return ''; } }
    function guardarToken(t){ try { localStorage.setItem(CLAVE_TOKEN, t); return true; } catch { return false; } }
    function borrarToken(){ try { localStorage.removeItem(CLAVE_TOKEN); } catch {} }

    function activarModoAdmin(activo){
        document.body.classList.toggle('modo-admin', activo);
        botonAgregar.hidden = !activo;
    }

    // ---------- Pintar la galería ----------
    // datos: { archivo, alt, miniatura?, nombre?, ruta?, rutaMiniatura? }
    // "ruta" y "rutaMiniatura" son las rutas reales en el repositorio cuando "archivo"
    // es una vista previa local (imágenes recién subidas).
    function crearItem(datos){
        const recuadro = document.createElement('figure');
        recuadro.className = 'gallery-item';
        recuadro.dataset.archivo = datos.ruta || datos.archivo;
        if (datos.rutaMiniatura || datos.miniatura) recuadro.dataset.miniatura = datos.rutaMiniatura || datos.miniatura;

        // Botón de eliminar: solo se ve en modo administrador (ver CSS)
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'boton-eliminar';
        borrar.setAttribute('aria-label', 'Eliminar imagen');
        borrar.title = 'Eliminar imagen';
        borrar.innerHTML = ICONO_BASURA;
        recuadro.append(borrar);

        const img = document.createElement('img');
        img.src = datos.archivo;
        img.alt = datos.alt || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        if (datos.nombre) img.dataset.nombre = datos.nombre;

        if (datos.miniatura){
            const picture = document.createElement('picture');
            const fuente = document.createElement('source');
            fuente.media = '(max-width: 768px)';
            fuente.srcset = datos.miniatura;
            picture.append(fuente, img);
            recuadro.append(picture);
        } else {
            recuadro.append(img);
        }
        return recuadro;
    }

    async function cargarGaleria(){
        try{
            const respuesta = await fetch('galeria.json?v=' + Date.now(), { cache: 'no-store' });
            if (!respuesta.ok) throw new Error('sin galeria.json');
            const datos = await respuesta.json();
            grid.replaceChildren(...(datos.imagenes || []).map(crearItem));
            delete grid.dataset.estado;
        } catch {
            // P. ej. abriendo el HTML en local (file://), donde el navegador no deja leer el archivo
            grid.dataset.estado = 'error';
        }
    }

    // Lista actual tomada de la página (respaldo si galeria.json no existiera)
    function galeriaDesdeLaPagina(){
        return [...grid.querySelectorAll('.gallery-item')].map(recuadro => {
            const datos = { archivo: recuadro.dataset.archivo, alt: recuadro.querySelector('img').alt };
            if (recuadro.dataset.miniatura) datos.miniatura = recuadro.dataset.miniatura;
            return datos;
        }).filter(d => d.archivo && !d.archivo.startsWith('blob:'));
    }

    // ---------- GitHub ----------
    async function gh(ruta, opciones = {}){
        const url = ruta.startsWith('http') ? ruta : API + '/repos/' + REPO + ruta;
        const encabezados = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + leerToken() };
        if (opciones.body) encabezados['Content-Type'] = 'application/json';
        const respuesta = await fetch(url, { ...opciones, headers: encabezados, cache: 'no-store' });
        if (!respuesta.ok){
            const error = new Error('GitHub respondió ' + respuesta.status);
            error.status = respuesta.status;
            try { error.detalle = (await respuesta.json()).message; } catch {}
            throw error;
        }
        return respuesta.status === 204 ? null : respuesta.json();
    }

    function mensajeDeError(error){
        if (error instanceof TypeError) return 'No se pudo conectar con GitHub. Revisa tu conexión e inténtalo de nuevo.';
        if (error.status === 401) return 'GitHub rechazó el token: no es válido o ya expiró. Toca "Desconectar este navegador" y conecta uno nuevo.';
        if (error.status === 403 || error.status === 404) return 'El token no tiene permiso para escribir en Mi-pagina-web-. Revisa que tenga acceso a ese repositorio y el permiso "Contents: Read and write".';
        if (error.status === 413) return 'Una de las imágenes es demasiado pesada para subirla desde aquí.';
        return error.mensaje || ('Algo salió mal' + (error.detalle ? ': ' + error.detalle : '.'));
    }

    function aBase64(blob){
        return new Promise((resolver, rechazar) => {
            const lector = new FileReader();
            lector.onload = () => resolver(String(lector.result).split(',')[1]);
            lector.onerror = () => rechazar(lector.error);
            lector.readAsDataURL(blob);
        });
    }

    function base64AUtf8(texto){
        const bytes = Uint8Array.from(atob(texto.replace(/\s/g, '')), c => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    // ---------- Preparar las imágenes antes de subirlas ----------
    const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };

    function aSlug(texto){
        return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'imagen';
    }

    function selloDeTiempo(){
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    function textoDesdeNombre(nombre){
        const base = nombre.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        return base || 'Imagen de la galería';
    }

    function cargarImagen(archivo){
        return new Promise((resolver, rechazar) => {
            const url = URL.createObjectURL(archivo);
            const img = new Image();
            img.onload = () => resolver({ img, url });
            img.onerror = () => { URL.revokeObjectURL(url); rechazar(Object.assign(new Error(), { mensaje: `"${archivo.name}" no es una imagen que el navegador pueda abrir.` })); };
            img.src = url;
        });
    }

    function dibujar(img, ladoMaximo){
        const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * escala);
        canvas.height = Math.round(img.naturalHeight * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function tieneTransparencia(img){
        const canvas = dibujar(img, 64);
        const pixeles = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixeles.length; i += 4) if (pixeles[i] < 250) return true;
        return false;
    }

    // Prueba los formatos en orden (Safari, por ejemplo, no siempre sabe crear WebP)
    async function codificar(canvas, tipos, calidad){
        for (const tipo of tipos){
            const blob = await new Promise(r => canvas.toBlob(r, tipo, calidad));
            if (blob && blob.type === tipo) return blob;
        }
        return new Promise(r => canvas.toBlob(r, 'image/png'));
    }

    async function prepararImagen(archivo, indice, sello, total){
        const base = aSlug(archivo.name.replace(/\.[^.]+$/, '')) + '-' + sello + (total > 1 ? '-' + (indice + 1) : '');

        // GIF (pueden ser animados) y SVG se suben tal cual
        if (archivo.type === 'image/gif' || archivo.type === 'image/svg+xml'){
            return { original: { blob: archivo, ruta: 'Images/' + base + EXTENSIONES[archivo.type] }, miniatura: null, vistaPrevia: URL.createObjectURL(archivo) };
        }

        const { img, url } = await cargarImagen(archivo);
        const conAlfa = (archivo.type === 'image/png' || archivo.type === 'image/webp') && tieneTransparencia(img);

        let original = archivo;
        if (archivo.size > LIMITE_SIN_TOCAR || !EXTENSIONES[archivo.type]){
            const canvas = dibujar(img, LADO_MAXIMO);
            original = conAlfa
                ? await codificar(canvas, ['image/webp'], 0.92)
                : await codificar(canvas, ['image/jpeg'], 0.9);
        }

        let miniatura = null;
        if (original.size > 200 * 1024 || Math.max(img.naturalWidth, img.naturalHeight) > 900){
            const canvas = dibujar(img, LADO_MINIATURA);
            const blob = await codificar(canvas, ['image/webp', conAlfa ? 'image/png' : 'image/jpeg'], 0.85);
            miniatura = { blob, ruta: 'Images/miniaturas/' + base + (EXTENSIONES[blob.type] || '.png') };
        }

        return {
            original: { blob: original, ruta: 'Images/' + base + (EXTENSIONES[original.type] || '.png') },
            miniatura,
            vistaPrevia: url
        };
    }

    // ---------- Publicar: un solo commit con imágenes + galeria.json ----------
    async function publicar(preparadas, descripcion){
        const archivos = preparadas.flatMap(p => [p.original, p.miniatura].filter(Boolean));
        const entradas = [];
        for (let i = 0; i < archivos.length; i++){
            estado(estadoSubir, `Subiendo archivo ${i + 1} de ${archivos.length}…`);
            const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await aBase64(archivos[i].blob), encoding: 'base64' }) });
            entradas.push({ path: archivos[i].ruta, mode: '100644', type: 'blob', sha: blob.sha });
        }

        const nuevas = preparadas.map(p => {
            const datos = { archivo: p.original.ruta, alt: descripcion || p.alt };
            if (p.miniatura) datos.miniatura = p.miniatura.ruta;
            return datos;
        });

        estado(estadoSubir, 'Publicando en la galería…');
        const mensaje = nuevas.length === 1 ? 'Agrega una imagen a la galería desde la página' : `Agrega ${nuevas.length} imágenes a la galería desde la página`;

        // Si justo otra subida cambió la rama, se reintenta sobre la versión nueva
        for (let intento = 1; intento <= 3; intento++){
            const ref = await gh('/git/ref/heads/' + RAMA);
            const padre = ref.object.sha;
            const commitPadre = await gh('/git/commits/' + padre);

            let galeria;
            try {
                const actual = await gh('/contents/galeria.json?ref=' + padre);
                galeria = JSON.parse(base64AUtf8(actual.content));
            } catch (error){
                if (error.status !== 404) throw error;
                galeria = { imagenes: galeriaDesdeLaPagina() };
            }
            galeria.imagenes = [...(galeria.imagenes || []), ...nuevas];

            const arbol = await gh('/git/trees', { method: 'POST', body: JSON.stringify({
                base_tree: commitPadre.tree.sha,
                tree: [...entradas, { path: 'galeria.json', mode: '100644', type: 'blob', content: JSON.stringify(galeria, null, 2) + '\n' }]
            }) });
            const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [padre] }) });

            try {
                await gh('/git/refs/heads/' + RAMA, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
                return nuevas;
            } catch (error){
                if (error.status !== 422 || intento === 3) throw error;
            }
        }
    }

    // ---------- Eliminar: un solo commit que borra los archivos y actualiza galeria.json ----------
    async function eliminarDelRepositorio(archivo, miniatura){
        for (let intento = 1; intento <= 3; intento++){
            const ref = await gh('/git/ref/heads/' + RAMA);
            const padre = ref.object.sha;
            const commitPadre = await gh('/git/commits/' + padre);
            const arbolActual = await gh('/git/trees/' + commitPadre.tree.sha + '?recursive=1');
            const existentes = new Set(arbolActual.tree.filter(e => e.type === 'blob').map(e => e.path));

            let galeria;
            try {
                const actual = await gh('/contents/galeria.json?ref=' + padre);
                galeria = JSON.parse(base64AUtf8(actual.content));
            } catch (error){
                if (error.status !== 404) throw error;
                galeria = { imagenes: galeriaDesdeLaPagina() };
            }

            const lista = galeria.imagenes || [];
            const entrada = lista.find(i => i.archivo === archivo);
            galeria.imagenes = lista.filter(i => i.archivo !== archivo);

            // Archivos a borrar: la imagen y su miniatura, solo dentro de Images/,
            // solo si existen y si ninguna otra imagen de la galería los usa
            const enUso = new Set(galeria.imagenes.flatMap(i => [i.archivo, i.miniatura]).filter(Boolean));
            const rutas = [...new Set([archivo, miniatura, entrada && entrada.miniatura])]
                .filter(r => r && r.startsWith('Images/') && existentes.has(r) && !enUso.has(r));

            if (!entrada && !rutas.length) return;   // ya estaba eliminada

            const arbol = await gh('/git/trees', { method: 'POST', body: JSON.stringify({
                base_tree: commitPadre.tree.sha,
                tree: [
                    ...rutas.map(path => ({ path, mode: '100644', type: 'blob', sha: null })),
                    { path: 'galeria.json', mode: '100644', type: 'blob', content: JSON.stringify(galeria, null, 2) + '\n' }
                ]
            }) });
            const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({
                message: 'Elimina una imagen de la galería desde la página', tree: arbol.sha, parents: [padre]
            }) });

            try {
                await gh('/git/refs/heads/' + RAMA, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
                return;
            } catch (error){
                if (error.status !== 422 || intento === 3) throw error;
            }
        }
    }

    function abrirConfirmarEliminar(recuadro){
        if (subiendo || eliminando) return;
        recuadroPorEliminar = recuadro;
        const img = recuadro.querySelector('img');
        previaEliminar.src = img.currentSrc || img.src;
        estado(estadoEliminar, '');
        botonConfirmarEliminar.disabled = false;
        botonCancelarEliminar.disabled = false;
        panelEliminar.showModal();
    }

    async function alConfirmarEliminar(){
        if (!recuadroPorEliminar || eliminando) return;
        eliminando = true;
        botonConfirmarEliminar.disabled = true;
        botonCancelarEliminar.disabled = true;
        estado(estadoEliminar, 'Eliminando…');
        const recuadro = recuadroPorEliminar;
        try {
            await eliminarDelRepositorio(recuadro.dataset.archivo, recuadro.dataset.miniatura);
            panelEliminar.close();
            recuadro.classList.add('saliendo');
            setTimeout(() => recuadro.remove(), 300);
            mostrarAviso('Imagen eliminada. Para los demás visitantes desaparece en 1 o 2 minutos.');
        } catch (error){
            estado(estadoEliminar, mensajeDeError(error), 'error');
            botonConfirmarEliminar.disabled = false;
        } finally {
            eliminando = false;
            botonCancelarEliminar.disabled = false;
        }
    }

    let temporizadorAviso;
    function mostrarAviso(texto){
        aviso.textContent = texto;
        aviso.classList.add('visible');
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 4500);
    }

    // ---------- Interfaz del panel ----------
    function estado(elemento, texto, tipo = ''){
        elemento.textContent = texto;
        elemento.className = 'estado' + (tipo ? ' ' + tipo : '');
    }

    function mostrarVista(vista){
        vistaConectar.hidden = vista !== 'conectar';
        vistaSubir.hidden = vista !== 'subir';
    }

    function abrirPanel(){
        mostrarVista(leerToken() ? 'subir' : 'conectar');
        if (!panel.open) panel.showModal();
        if (!leerToken()) setTimeout(() => campoToken.focus(), 50);
    }

    function limpiarSeleccion(){
        urlsPrevias.forEach(u => URL.revokeObjectURL(u));
        urlsPrevias = [];
        archivosElegidos = [];
        campoArchivos.value = '';
        previas.replaceChildren();
        textoArchivos.textContent = 'Toca o arrastra aquí tus imágenes';
        botonPublicar.disabled = true;
    }

    function elegirArchivos(lista){
        const imagenes = [...lista].filter(a => a.type.startsWith('image/'));
        limpiarSeleccion();
        estado(estadoSubir, '');
        if (!imagenes.length){
            if (lista.length) estado(estadoSubir, 'Elige archivos de imagen (JPG, PNG, WebP o GIF).', 'error');
            return;
        }
        if (imagenes.length > MAX_ARCHIVOS){
            estado(estadoSubir, `Puedes subir hasta ${MAX_ARCHIVOS} imágenes a la vez.`, 'error');
            return;
        }
        const pesada = imagenes.find(a => a.size > LIMITE_ENTRADA);
        if (pesada){
            estado(estadoSubir, `"${pesada.name}" pesa más de 25 MB.`, 'error');
            return;
        }
        archivosElegidos = imagenes;
        textoArchivos.textContent = imagenes.length === 1 ? imagenes[0].name : `${imagenes.length} imágenes elegidas`;
        imagenes.forEach(a => {
            const url = URL.createObjectURL(a);
            urlsPrevias.push(url);
            const mini = document.createElement('img');
            mini.src = url;
            mini.alt = '';
            previas.append(mini);
        });
        botonPublicar.disabled = false;
    }

    async function alPublicar(){
        if (subiendo || !archivosElegidos.length) return;
        subiendo = true;
        botonPublicar.disabled = true;
        botonDesconectar.disabled = true;
        try {
            estado(estadoSubir, 'Preparando imágenes…');
            const sello = selloDeTiempo();
            const preparadas = [];
            for (let i = 0; i < archivosElegidos.length; i++){
                const p = await prepararImagen(archivosElegidos[i], i, sello, archivosElegidos.length);
                p.alt = textoDesdeNombre(archivosElegidos[i].name);
                preparadas.push(p);
            }
            const descripcion = campoDescripcion.value.trim();
            const nuevas = await publicar(preparadas, descripcion);

            // Se muestran de inmediato en esta página (para los demás, en 1-2 minutos)
            nuevas.forEach((datos, i) => {
                grid.append(crearItem({
                    archivo: preparadas[i].vistaPrevia,
                    ruta: datos.archivo,
                    rutaMiniatura: datos.miniatura,
                    alt: datos.alt,
                    nombre: datos.archivo.split('/').pop()
                }));
            });
            delete grid.dataset.estado;
            limpiarSeleccion();
            campoDescripcion.value = '';
            estado(estadoSubir, nuevas.length === 1
                ? '¡Listo! La imagen ya está en tu galería. Para los demás visitantes aparece en 1 o 2 minutos.'
                : `¡Listo! Se agregaron ${nuevas.length} imágenes. Para los demás visitantes aparecen en 1 o 2 minutos.`, 'ok');
        } catch (error){
            estado(estadoSubir, mensajeDeError(error), 'error');
            botonPublicar.disabled = !archivosElegidos.length;
        } finally {
            subiendo = false;
            botonDesconectar.disabled = false;
        }
    }

    async function alConectar(){
        const token = campoToken.value.trim();
        if (!token){ estado(estadoConectar, 'Pega tu token primero.', 'error'); return; }
        botonConectar.disabled = true;
        estado(estadoConectar, 'Comprobando el token…');
        const anterior = leerToken();
        if (!guardarToken(token)){
            estado(estadoConectar, 'Este navegador no permite guardar datos (¿modo incógnito?). Prueba en una ventana normal.', 'error');
            botonConectar.disabled = false;
            return;
        }
        try {
            const usuario = await gh(API + '/user');
            if (usuario.login.toLowerCase() !== REPO.split('/')[0].toLowerCase()){
                throw Object.assign(new Error(), { mensaje: `Ese token es de la cuenta "${usuario.login}", no de ${REPO.split('/')[0]}.` });
            }
            campoToken.value = '';
            estado(estadoConectar, '');
            activarModoAdmin(true);
            mostrarVista('subir');
            mostrarApartado(true, false);   // abre la galería detrás del panel
        } catch (error){
            if (anterior) guardarToken(anterior); else borrarToken();
            estado(estadoConectar, mensajeDeError(error), 'error');
        } finally {
            botonConectar.disabled = false;
        }
    }

    // ---------- Eventos ----------
    botonAgregar.addEventListener('click', abrirPanel);
    botonConectar.addEventListener('click', alConectar);
    campoToken.addEventListener('keydown', e => { if (e.key === 'Enter') alConectar(); });
    campoArchivos.addEventListener('change', () => elegirArchivos(campoArchivos.files));
    botonPublicar.addEventListener('click', alPublicar);
    botonCerrarPanel.addEventListener('click', () => panel.close());
    panel.addEventListener('cancel', e => { if (subiendo) e.preventDefault(); });
    panel.addEventListener('click', e => { if (e.target === panel && !subiendo) panel.close(); });

    ['dragenter', 'dragover'].forEach(tipo => zonaArchivos.addEventListener(tipo, e => { e.preventDefault(); zonaArchivos.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(tipo => zonaArchivos.addEventListener(tipo, () => zonaArchivos.classList.remove('arrastrando')));
    zonaArchivos.addEventListener('drop', e => { e.preventDefault(); elegirArchivos(e.dataTransfer.files); });

    grid.addEventListener('click', e => {
        const boton = e.target.closest('.boton-eliminar');
        if (boton && document.body.classList.contains('modo-admin')) abrirConfirmarEliminar(boton.closest('.gallery-item'));
    });
    botonConfirmarEliminar.addEventListener('click', alConfirmarEliminar);
    botonCancelarEliminar.addEventListener('click', () => panelEliminar.close());
    panelEliminar.addEventListener('cancel', e => { if (eliminando) e.preventDefault(); });
    panelEliminar.addEventListener('click', e => { if (e.target === panelEliminar && !eliminando) panelEliminar.close(); });

    botonDesconectar.addEventListener('click', () => {
        borrarToken();
        limpiarSeleccion();
        activarModoAdmin(false);
        estado(estadoSubir, '');
        panel.close();
    });

    // ---------- Inicio ----------
    activarModoAdmin(!!leerToken());
    cargarGaleria();

    // Entrar como administrador: abrir la página con ?admin al final
    if (new URLSearchParams(location.search).has('admin')){
        history.replaceState(null, '', location.pathname + location.hash);
        abrirPanel();
    }
})();
