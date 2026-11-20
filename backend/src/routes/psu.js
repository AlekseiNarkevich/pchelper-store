/**
 * PCHelper (курсовая) — калькулятор мощности блока питания.
 *
 *   GET /api/v1/psu?cpu=cpu:1&gpu=gpu:2
 *
 * Рекомендуемая мощность считается по TDP процессора и видеокарты
 * с запасом 25%. В ответ попадают только блоки питания, которые
 * этот запас обеспечивают.
 */
import { Router } from 'express';

import { apiError, validation } from '../domain/errors.js';
import { getProduct, listProducts } from '../repositories/catalog.repository.js';
import {
  boolField,
  numField,
  recommendPsu,
  textField,
} from '../services/compatibility.service.js';

const router = Router();

/**
 * Оборачивает асинхронный обработчик.
 *
 * @param {Function} handler Обработчик.
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

router.get(
  '/psu',
  asyncHandler(async (req, res) => {
    const cpuId = String(req.query.cpu || '');
    if (!/^cpu:\d+$/.test(cpuId)) {
      throw validation('Укажите процессор в виде «cpu:1»');
    }

    const cpu = await getProduct(cpuId);
    if (!cpu) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Процессор не найден');

    let gpu = null;
    const gpuId = String(req.query.gpu || '');
    if (gpuId) {
      if (!/^gpu:\d+$/.test(gpuId)) {
        throw validation('Видеокарта указывается в виде «gpu:1»');
      }
      gpu = await getProduct(gpuId);
      if (!gpu) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Видеокарта не найдена');
    }

    const recommendation = recommendPsu(cpu, gpu);
    const all = await listProducts({ category: 'psu', limit: 100, sort: 'price_asc' });
    const items = all.items
      .filter(
        (item) =>
          numField(item, 'мощность_в_ваттах', 'Мощность') >=
          recommendation.recommendedWatts,
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        watts: numField(item, 'мощность_в_ваттах', 'Мощность'),
        standard: textField(item, 'стандарт_блока_питания', 'Стандарт'),
        certificate: textField(item, 'сертификат_80plus', 'Сертификат 80 PLUS'),
        modular: boolField(item, 'модульный', 'Модульный'),
        pcieGen5: boolField(item, 'pcie_gen5', 'PCIe 5.0'),
      }))
      .sort((a, b) => a.watts - b.watts || a.price - b.price);

    res.status(200).json({
      cpu: { id: cpu.id, name: cpu.name, tdp: recommendation.cpuTdp },
      gpu: gpu ? { id: gpu.id, name: gpu.name, tdp: recommendation.gpuTdp } : null,
      recommendation,
      items,
      total: items.length,
    });
  }),
);

export default router;
