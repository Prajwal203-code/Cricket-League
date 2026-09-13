using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.UI.Core
{
    public class UIManager : MonoBehaviour
    {
        public static UIManager Instance { get; private set; }

        [Header("Screen Registry")]
        [SerializeField] private List<UIScreen> registeredScreens = new List<UIScreen>();

        [Header("Layers & Canvas")]
        [SerializeField] private Canvas gameCanvas;
        [SerializeField] private Canvas hudCanvas;
        [SerializeField] private Canvas popupCanvas;
        [SerializeField] private Image modalBackdrop;

        private readonly Dictionary<ScreenType, UIScreen> _screenDict = new Dictionary<ScreenType, UIScreen>();
        private readonly Stack<UIScreen> _screenStack = new Stack<UIScreen>();
        private UIScreen _activeModal;

        public event Action<ScreenType> OnScreenChanged;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);

            InitializeScreenRegistry();
        }

        private void Start()
        {
            // Initial Screen
            Push(ScreenType.Splash);
        }

        private void InitializeScreenRegistry()
        {
            foreach (var screen in registeredScreens)
            {
                if (screen != null && !_screenDict.ContainsKey(screen.Type))
                {
                    _screenDict.Add(screen.Type, screen);
                    screen.gameObject.SetActive(false);
                }
            }

            if (modalBackdrop != null)
            {
                modalBackdrop.gameObject.SetActive(false);
            }
        }

        public void Push(ScreenType screenType, object data = null)
        {
            if (!_screenDict.TryGetValue(screenType, out var nextScreen))
            {
                Debug.LogWarning($"Screen {screenType} not found in UIManager registry!");
                return;
            }

            if (_screenStack.Count > 0)
            {
                var currentScreen = _screenStack.Peek();
                currentScreen.OnHide();
            }

            _screenStack.Push(nextScreen);
            nextScreen.OnShow(data);
            OnScreenChanged?.Invoke(screenType);
        }

        public void Pop()
        {
            if (_screenStack.Count <= 1)
            {
                Debug.LogWarning("Cannot pop the root screen!");
                return;
            }

            var currentScreen = _screenStack.Pop();
            currentScreen.OnHide(() =>
            {
                if (_screenStack.Count > 0)
                {
                    var previousScreen = _screenStack.Peek();
                    previousScreen.OnShow();
                    OnScreenChanged?.Invoke(previousScreen.Type);
                }
            });
        }

        public void Replace(ScreenType screenType, object data = null)
        {
            if (!_screenDict.TryGetValue(screenType, out var nextScreen)) return;

            if (_screenStack.Count > 0)
            {
                var currentScreen = _screenStack.Pop();
                currentScreen.OnHide();
            }

            _screenStack.Push(nextScreen);
            nextScreen.OnShow(data);
            OnScreenChanged?.Invoke(screenType);
        }

        public void ShowModal(ScreenType screenType, object data = null)
        {
            if (!_screenDict.TryGetValue(screenType, out var modalScreen)) return;

            _activeModal = modalScreen;

            if (modalBackdrop != null)
            {
                modalBackdrop.gameObject.SetActive(true);
            }

            modalScreen.OnShow(data);
        }

        public void DismissModal()
        {
            if (_activeModal != null)
            {
                _activeModal.OnHide(() =>
                {
                    if (modalBackdrop != null) modalBackdrop.gameObject.SetActive(false);
                    _activeModal = null;
                });
            }
        }

        public T GetScreen<T>(ScreenType type) where T : UIScreen
        {
            if (_screenDict.TryGetValue(type, out var screen))
            {
                return screen as T;
            }
            return null;
        }

        public void SetHudVisibility(bool visible)
        {
            if (hudCanvas != null)
            {
                hudCanvas.gameObject.SetActive(visible);
            }
        }
    }
}
