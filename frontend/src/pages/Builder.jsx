import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getProducts, money } from '../api.js';
import { readAuth } from '../auth.js';
import { checkCompatibility, getBuild, saveBuild } from '../builds.js';
import {
  booleanOf,
  formRank,
  hasIntegratedGraphics,
  numberOf,
  textOf,
} from '../productFields.js';

/**
 * Ключ черновика привязан к пользователю: сборка одного аккаунта
 * не должна всплывать в конфигураторе другого.
 *
 * @returns {string}
 */
function draftKey() {
  const user = readAuth().user;
  return `pchelper_builder_v2:${user?.id || 'guest'}`;
}

/**
 * Читает черновик синхронно при первом рендере.
 *
 * Если читать его внутри эффекта загрузки, эффект автосохранения успевает
 * записать пустой черновик раньше — и сборка теряется при перезагрузке.
 *
 * @returns {object|null}
 */
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || 'null');
  } catch {
    return null;
  }
}

/** Восемь шагов конфигуратора и итоговый экран. */
const STEPS = [
  { key: 'cpu', title: 'Процессор', next: 'Материнская плата' },
  { key: 'motherboard', title: 'Материнская плата', next: 'Оперативная память' },
  { key: 'ram', title: 'Оперативная память', next: 'Охлаждение' },
  { key: 'cooling', title: 'Система охлаждения', next: 'Видеокарта' },
  { key: 'gpu', title: 'Видеокарта', next: 'Накопители' },
  { key: 'storage', title: 'Накопители', next: 'Блок питания' },
  { key: 'psu', title: 'Блок питания', next: 'Корпус' },
  { key: 'case', title: 'Корпус', next: 'Проверка сборки' },
  { key: 'summary', title: 'Проверка и сохранение' },
];

/** Колонки таблиц подбора. */
const COLUMNS = {
  cpu: [
    { label: 'Сокет', value: (p) => textOf(p, 'сокет', 'Сокет') },
    {
      label: 'Ядра / потоки',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Ядра / потоки');
        return spec?.value || '—';
      },
    },
    {
      label: 'Частота',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Частота');
        return spec?.value || '—';
      },
    },
    { label: 'TDP', value: (p) => `${numberOf(p, 'tdp', 'TDP')} Вт` },
    {
      label: 'Графика',
      value: (p) => (hasIntegratedGraphics(p) ? 'встроенная' : 'нет'),
    },
  ],
  motherboard: [
    { label: 'Сокет', value: (p) => textOf(p, 'сокет', 'Сокет') },
    { label: 'Чипсет', value: (p) => textOf(p, 'чипсет', 'Чипсет') },
    { label: 'Память', value: (p) => textOf(p, 'тип_памяти', 'Тип памяти') },
    { label: 'Форм-фактор', value: (p) => textOf(p, 'форм_фактор', 'Форм-фактор') },
    { label: 'M.2', value: (p) => numberOf(p, 'm2_слоты', 'Слоты M.2') || '—' },
  ],
  ram: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    { label: 'Объём', value: (p) => `${numberOf(p, 'объем', 'Объём')} ГБ` },
    { label: 'Частота', value: (p) => `${numberOf(p, 'частота', 'Частота')} МГц` },
    { label: 'Тайминги', value: (p) => textOf(p, 'тайминги', 'Тайминги') || '—' },
  ],
  cooling: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    {
      label: 'Рассеиваемая мощность',
      value: (p) => `${numberOf(p, 'tdp', 'Рассеиваемая мощность')} Вт`,
    },
    { label: 'Высота', value: (p) => `${numberOf(p, 'высота', 'Высота')} мм` },
    {
      label: 'Радиатор',
      value: (p) => {
        const size = numberOf(p, 'длина_радиатора', 'Длина радиатора');
        return size ? `${size} мм` : '—';
      },
    },
  ],
  gpu: [
    { label: 'Память', value: (p) => `${numberOf(p, 'объем_памяти', 'Память')} ГБ` },
    { label: 'Длина', value: (p) => `${numberOf(p, 'длина', 'Длина')} мм` },
    { label: 'TDP', value: (p) => `${numberOf(p, 'tdp', 'TDP')} Вт` },
    {
      label: 'Вентиляторы',
      value: (p) => numberOf(p, 'количество_вентиляторов', 'Вентиляторы') || '—',
    },
  ],
  storage: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    { label: 'Объём', value: (p) => `${numberOf(p, 'объем_в_гб', 'Объём')} ГБ` },
    { label: 'Интерфейс', value: (p) => textOf(p, 'интерфейс', 'Интерфейс') },
    {
      label: 'Скорость',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Скорость чтения / записи');
        return spec?.value || '—';
      },
    },
  ],
  psu: [
    {
      label: 'Мощность',
      value: (p) => `${numberOf(p, 'мощность_в_ваттах', 'Мощность')} Вт`,
    },
    {
      label: '80 PLUS',
      value: (p) => textOf(p, 'сертификат_80plus', 'Сертификат 80 PLUS') || '—',
    },
    {
      label: 'Модульный',
      value: (p) => (booleanOf(p, 'модульный', 'Модульный') ? 'да' : 'нет'),
    },
    {
      label: 'PCIe 5.0',
      value: (p) => (booleanOf(p, 'pcie_gen5', 'PCIe 5.0') ? 'да' : 'нет'),
    },
  ],
  case: [
    { label: 'Форм-фактор', value: (p) => textOf(p, 'форм_фактор', 'Форм-фактор') },
    {
      label: 'Макс. видеокарта',
      value: (p) =>
        `${numberOf(p, 'макс_длина_gpu', 'Максимальная длина видеокарты')} мм`,
    },
    {
      label: 'Макс. кулер',
      value: (p) =>
        `${numberOf(p, 'макс_высота_кулера', 'Максимальная высота кулера')} мм`,
    },
  ],
};

/**
 * Таблица выбора комплектующих.
 */
function ProductTable({ items, columns, isSelected, onPick, emptyText }) {
  if (!items.length) {
    return <div className="state">{emptyText}</div>;
  }

  return (
    <div className="picker-wrap">
      <table className="picker">
        <thead>
          <tr>
            <th aria-label="Выбор" />
            <th>Название</th>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
            <th>Цена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => {
            const selected = isSelected(product);
            return (
              <tr
                className={selected ? 'is-on' : ''}
                key={product.id}
                onClick={() => onPick(product)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPick(product);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <span className="picker-check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                </td>
                <td className="picker-name">{product.name}</td>
                {columns.map((column) => (
                  <td key={column.label}>{column.value(product)}</td>
                ))}
                <td className="picker-price">{money(product.price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Пошаговый конфигуратор ПК с проверкой совместимости на сервере.
 */
export default function Builder() {
  const [lists, setLists] = useState({
    cpu: [],
    motherboard: [],
    ram: [],
    cooling: [],
    gpu: [],
    storage: [],
    psu: [],
    case: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState({
    cpu: null,
    motherboard: null,
    ram: null,
    cooling: null,
    gpu: null,
    storage: [],
    psu: null,
    case: null,
  });
  const [skipGpu, setSkipGpu] = useState(false);
  const [buildName, setBuildName] = useState('');
  const [note, setNote] = useState('');
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft] = useState(readDraft);
  const [hydrated, setHydrated] = useState(false);
  const [searchParams] = useSearchParams();
  const buildId = searchParams.get('build');
  const loadedBuildRef = useRef(false);

  // Загрузка каталога и восстановление черновика.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const keys = [
          'cpu',
          'motherboard',
          'ram',
          'cooling',
          'gpu',
          'storage',
          'psu',
          'case',
        ];
        const loaded = await Promise.all(
          keys.map((category) =>
            getProducts({ category, limit: 100, sort: 'price_asc' }),
          ),
        );
        if (!alive) return;

        const next = {};
        keys.forEach((category, index) => {
          next[category] = loaded[index].items;
        });
        setLists(next);

        if (draft && !buildId) {
          const find = (category, id) =>
            id ? next[category].find((product) => product.id === id) || null : null;
          setSelection({
            cpu: find('cpu', draft.cpu),
            motherboard: find('motherboard', draft.motherboard),
            ram: find('ram', draft.ram),
            cooling: find('cooling', draft.cooling),
            gpu: find('gpu', draft.gpu),
            storage: (draft.storage || [])
              .map((id) => find('storage', id))
              .filter(Boolean),
            psu: find('psu', draft.psu),
            case: find('case', draft.case),
          });
          setSkipGpu(Boolean(draft.skipGpu));
          setStep(Number(draft.step) || 0);
          setBuildName(draft.name || '');
          setNote(draft.note || '');
        }
        setHydrated(true);
      } catch (reason) {
        if (alive) setLoadError(reason.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [draft, buildId]);

  // Черновик хранится в localStorage: только идентификаторы, без секретов.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        draftKey(),
        JSON.stringify({
          step,
          cpu: selection.cpu?.id || null,
          motherboard: selection.motherboard?.id || null,
          ram: selection.ram?.id || null,
          cooling: selection.cooling?.id || null,
          gpu: selection.gpu?.id || null,
          storage: selection.storage.map((product) => product.id),
          psu: selection.psu?.id || null,
          case: selection.case?.id || null,
          skipGpu,
          name: buildName,
          note,
        }),
      );
    } catch {
      /* приватный режим браузера */
    }
  }, [step, selection, skipGpu, buildName, note, hydrated]);

  const socket = textOf(selection.cpu, 'сокет', 'Сокет');
  const memoryType = textOf(selection.motherboard, 'тип_памяти', 'Тип памяти');
  const cpuTdp = numberOf(selection.cpu, 'tdp', 'TDP');
  const gpuTdp = skipGpu ? 0 : numberOf(selection.gpu, 'tdp', 'TDP');
  const needWatts = Math.ceil((cpuTdp + gpuTdp) * 1.25);
  const integrated = hasIntegratedGraphics(selection.cpu);

  const motherboards = useMemo(
    () =>
      socket
        ? lists.motherboard.filter(
            (product) => textOf(product, 'сокет', 'Сокет') === socket,
          )
        : lists.motherboard,
    [lists.motherboard, socket],
  );

  const rams = useMemo(
    () =>
      memoryType
        ? lists.ram.filter((product) => textOf(product, 'тип', 'Тип') === memoryType)
        : lists.ram,
    [lists.ram, memoryType],
  );

  const coolings = useMemo(
    () =>
      cpuTdp
        ? lists.cooling.filter(
            (product) => numberOf(product, 'tdp', 'Рассеиваемая мощность') >= cpuTdp,
          )
        : lists.cooling,
    [lists.cooling, cpuTdp],
  );

  const psus = useMemo(
    () =>
      needWatts
        ? lists.psu.filter(
            (product) =>
              numberOf(product, 'мощность_в_ваттах', 'Мощность') >= needWatts,
          )
        : lists.psu,
    [lists.psu, needWatts],
  );

  const cases = useMemo(() => {
    const boardRank = formRank(
      textOf(selection.motherboard, 'форм_фактор', 'Форм-фактор'),
    );
    const gpuLength = numberOf(selection.gpu, 'длина', 'Длина');
    const coolerHeight = numberOf(selection.cooling, 'высота', 'Высота');
    const coolingType = textOf(selection.cooling, 'тип', 'Тип').toLowerCase();
    const isLiquid =
      coolingType.includes('жидк') ||
      coolingType.includes('водян') ||
      coolingType.includes('сжо') ||
      coolingType.includes('aio');
    const radiator = numberOf(selection.cooling, 'длина_радиатора', 'Длина радиатора');

    return lists.case.filter((product) => {
      if (selection.motherboard) {
        if (formRank(textOf(product, 'форм_фактор', 'Форм-фактор')) < boardRank) {
          return false;
        }
      }
      if (selection.gpu && !skipGpu) {
        const maxGpu = numberOf(
          product,
          'макс_длина_gpu',
          'Максимальная длина видеокарты',
        );
        if (gpuLength > 0 && maxGpu > 0 && gpuLength > maxGpu) return false;
      }
      if (selection.cooling) {
        if (isLiquid) {
          const maxRadiator = numberOf(
            product,
            'макс_длина_радиатора',
            'Максимальная длина радиатора',
          );
          if (radiator > 0 && maxRadiator > 0 && radiator > maxRadiator) {
            return false;
          }
        } else {
          const maxCooler = numberOf(
            product,
            'макс_высота_кулера',
            'Максимальная высота кулера',
          );
          if (coolerHeight > 0 && maxCooler > 0 && coolerHeight > maxCooler) {
            return false;
          }
        }
      }
      return true;
    });
  }, [lists.case, selection.motherboard, selection.cooling, selection.gpu, skipGpu]);

  // Открытие сохранённой сборки: /builder?build=42.
  useEffect(() => {
    if (!buildId || loading || loadedBuildRef.current) return undefined;
    loadedBuildRef.current = true;
    let alive = true;

    getBuild(buildId)
      .then(({ build }) => {
        if (!alive) return;
        const next = {
          cpu: null,
          motherboard: null,
          ram: null,
          cooling: null,
          gpu: null,
          storage: [],
          psu: null,
          case: null,
        };
        for (const component of build.components) {
          if (component.category === 'storage') {
            next.storage.push(component.product);
          } else {
            next[component.category] = component.product;
          }
        }
        setSelection(next);
        setSkipGpu(!next.gpu);
        setBuildName(build.name);
        setNote(build.note || '');
        setStep(8);
        setHydrated(true);
      })
      .catch((reason) => {
        if (alive) setError(reason.message);
      });

    return () => {
      alive = false;
    };
  }, [buildId, loading]);

  // Встроенной графики нет — режим «без видеокарты» недоступен.
  useEffect(() => {
    if (!integrated) setSkipGpu(false);
  }, [integrated]);

  // Если зависимость изменилась — снимаем несовместимый выбор.
  useEffect(() => {
    setSelection((current) => {
      const next = { ...current };
      if (next.motherboard && !motherboards.some((p) => p.id === next.motherboard.id)) {
        next.motherboard = null;
      }
      if (next.ram && !rams.some((p) => p.id === next.ram.id)) next.ram = null;
      if (next.cooling && !coolings.some((p) => p.id === next.cooling.id)) {
        next.cooling = null;
      }
      if (next.psu && !psus.some((p) => p.id === next.psu.id)) next.psu = null;
      if (next.case && !cases.some((p) => p.id === next.case.id)) next.case = null;
      return next;
    });
  }, [motherboards, rams, coolings, psus, cases]);

  const total = useMemo(() => {
    const values = [
      selection.cpu,
      selection.motherboard,
      selection.ram,
      selection.cooling,
      skipGpu ? null : selection.gpu,
      ...selection.storage,
      selection.psu,
      selection.case,
    ];
    return values.reduce((sum, product) => sum + (product ? product.price : 0), 0);
  }, [selection, skipGpu]);

  const payload = useMemo(() => {
    const components = {};
    for (const key of ['cpu', 'motherboard', 'ram', 'cooling', 'psu', 'case']) {
      if (selection[key]) components[key] = selection[key].id;
    }
    if (!skipGpu && selection.gpu) components.gpu = selection.gpu.id;
    if (selection.storage.length) {
      components.storage = selection.storage.map((product) => product.id);
    }
    return components;
  }, [selection, skipGpu]);

  const storageValid =
    selection.storage.filter((p) =>
      textOf(p, 'тип', 'Тип').toUpperCase().includes('SSD'),
    ).length === 1 &&
    selection.storage.filter((p) =>
      textOf(p, 'тип', 'Тип').toUpperCase().includes('HDD'),
    ).length <= 1;

  const current = STEPS[step];

  const canNext =
    current.key === 'summary'
      ? true
      : current.key === 'gpu'
        ? Boolean(selection.gpu) || skipGpu
        : current.key === 'storage'
          ? storageValid
          : Boolean(selection[current.key]);

  /**
   * Выбор комплектующего. Для накопителей действует правило:
   * ровно один SSD и не более одного HDD.
   */
  function pick(product) {
    const key = current.key;
    if (key === 'storage') {
      const type = textOf(product, 'тип', 'Тип').toUpperCase();
      const isSsd = type.includes('SSD');
      const isHdd = type.includes('HDD');
      if (!isSsd && !isHdd) return;
      setSelection((currentSelection) => {
        const exists = currentSelection.storage.some((p) => p.id === product.id);
        let list = currentSelection.storage;
        if (exists) {
          list = list.filter((p) => p.id !== product.id);
        } else {
          list = list.filter((p) =>
            isSsd
              ? !textOf(p, 'тип', 'Тип').toUpperCase().includes('SSD')
              : !textOf(p, 'тип', 'Тип').toUpperCase().includes('HDD'),
          );
          list = [...list, product];
        }
        return { ...currentSelection, storage: list };
      });
      return;
    }

    if (key === 'gpu') setSkipGpu(false);
    setSelection((currentSelection) => ({ ...currentSelection, [key]: product }));
    setCheck(null);
  }

  function isSelected(product) {
    if (current.key === 'storage') {
      return selection.storage.some((item) => item.id === product.id);
    }
    if (current.key === 'gpu' && skipGpu) return false;
    return selection[current.key]?.id === product.id;
  }

  async function handleCheck() {
    setError('');
    setMessage('');
    if (!payload.cpu) {
      setError('Сначала выберите процессор.');
      return;
    }
    try {
      const result = await checkCompatibility(payload);
      setCheck(result);
      setMessage(
        result.compatible
          ? 'Сборка совместима.'
          : `Найдено проблем: ${result.errors.length}.`,
      );
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function handleSave() {
    setError('');
    setMessage('');
    if (!readAuth().accessToken) {
      setError('Чтобы сохранить сборку, войдите в аккаунт.');
      return;
    }
    setSaving(true);
    try {
      const name =
        buildName.trim() || `Сборка от ${new Date().toLocaleDateString('ru-RU')}`;
      const result = await saveBuild({ name, note, components: payload });
      setMessage(`Сборка «${result.build.name}» сохранена в профиле.`);
      setBuildName(result.build.name);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  function renderStep() {
    if (current.key === 'summary') {
      return (
        <div className="builder-summary-step">
          <div className="field">
            <span>Название сборки</span>
            <input
              maxLength={150}
              onChange={(event) => setBuildName(event.target.value)}
              placeholder="Например, «Игровая сборка 1440p»"
              type="text"
              value={buildName}
            />
          </div>
          <div className="field">
            <span>Заметка</span>
            <textarea
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Для каких задач собираете ПК"
              rows={3}
              value={note}
            />
          </div>

          <div className="builder-actions">
            <button className="btn btn-secondary" onClick={handleCheck} type="button">
              Проверить совместимость
            </button>
            <button
              className="btn"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? 'Сохраняем…' : 'Сохранить сборку'}
            </button>
            <Link className="btn btn-secondary" to="/builds">
              Мои сборки
            </Link>
          </div>

          {check && (
            <div className="compat-result" aria-live="polite">
              <strong>
                {check.compatible
                  ? 'Проверка пройдена: сборка совместима.'
                  : 'Проверка не пройдена:'}
              </strong>
              {check.errors.length > 0 && (
                <ul className="compat-errors">
                  {check.errors.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {check.warnings.length > 0 && (
                <ul className="compat-warnings">
                  {check.warnings.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      );
    }

    if (current.key === 'gpu') {
      return (
        <>
          {integrated && (
            <button
              className={`btn ${skipGpu ? '' : 'btn-secondary'}`}
              onClick={() => {
                setSkipGpu(true);
                setCheck(null);
                setSelection((currentSelection) => ({
                  ...currentSelection,
                  gpu: null,
                }));
              }}
              type="button"
            >
              Без дискретной видеокарты (встроенная графика)
            </button>
          )}
          <ProductTable
            columns={COLUMNS.gpu}
            emptyText="Видеокарты не найдены."
            isSelected={isSelected}
            items={lists.gpu}
            onPick={pick}
          />
        </>
      );
    }

    const items = {
      cpu: lists.cpu,
      motherboard: motherboards,
      ram: rams,
      cooling: coolings,
      storage: lists.storage,
      psu: psus,
      case: cases,
    }[current.key];

    return (
      <>
        {current.key === 'motherboard' && socket && (
          <p className="hint">
            Показаны платы с сокетом <strong>{socket}</strong> под выбранный процессор.
          </p>
        )}
        {current.key === 'ram' && memoryType && (
          <p className="hint">
            Показана память типа <strong>{memoryType}</strong> под выбранную плату.
          </p>
        )}
        {current.key === 'psu' && needWatts > 0 && (
          <p className="hint">
            Рекомендуемая мощность с запасом 25%: <strong>{needWatts} Вт</strong>{' '}
            (процессор {cpuTdp} Вт
            {gpuTdp > 0 ? `, видеокарта ${gpuTdp} Вт` : ''}).
          </p>
        )}
        {current.key === 'storage' && (
          <p className="hint">
            Нужен ровно один SSD; HDD можно добавить один. Повторный клик снимает выбор.
          </p>
        )}
        <ProductTable
          columns={COLUMNS[current.key]}
          emptyText={
            current.key === 'psu'
              ? 'Подходящих блоков питания нет — выберите более мощную модель.'
              : 'Подходящих вариантов нет. Измените предыдущий шаг.'
          }
          isSelected={isSelected}
          items={items}
          onPick={pick}
        />
      </>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <div className="state">Загружаем комплектующие…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container">
        <div className="state error">Не удалось загрузить каталог: {loadError}</div>
      </div>
    );
  }

  return (
    <div className="container builder">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Конфигуратор</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            {current.title}
          </div>
          <div className="sub">
            Шаг {Math.min(step + 1, STEPS.length)} из {STEPS.length}
          </div>
        </div>
        <Link className="btn btn-secondary" to="/psu">
          Калькулятор БП
        </Link>
      </div>

      {error && (
        <div className="state error" role="alert">
          {error} {!readAuth().accessToken && <Link to="/login">Войти</Link>}
        </div>
      )}

      <div className="step-strip" role="list">
        {STEPS.map((item, index) => (
          <button
            className={`step-pill${index === step ? ' is-on' : ''}${
              index < step ? ' is-done' : ''
            }`}
            key={item.key}
            onClick={() => setStep(index)}
            type="button"
          >
            <span className="step-num">{index + 1}</span>
            <span>{item.title}</span>
          </button>
        ))}
      </div>

      <div className="builder-layout">
        <section className="builder-main">
          {message && <div className="state">{message}</div>}
          {renderStep()}
        </section>

        <aside className="builder-side">
          <h3>Ваша сборка</h3>
          <dl className="build-parts">
            {STEPS.slice(0, 8).map((item) => {
              const value =
                item.key === 'storage'
                  ? selection.storage.map((p) => p.name).join(', ')
                  : item.key === 'gpu' && skipGpu
                    ? 'встроенная графика'
                    : selection[item.key]?.name || '';
              return (
                <div key={item.key}>
                  <dt>{item.title}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              );
            })}
          </dl>
          <div className="build-total">
            <span>Итого</span>
            <strong>{money(total)}</strong>
          </div>
          {needWatts > 0 && (
            <p className="hint">Блок питания: не менее {needWatts} Вт с запасом 25%.</p>
          )}
        </aside>
      </div>

      <div className="builder-nav">
        <button
          className="btn btn-secondary"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          type="button"
        >
          ← Назад
        </button>
        {step < STEPS.length - 1 && (
          <button
            className="btn"
            disabled={!canNext}
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            type="button"
          >
            {current.next} →
          </button>
        )}
      </div>
    </div>
  );
}
