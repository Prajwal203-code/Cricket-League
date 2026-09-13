using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace CricketStrike.UI.Components
{
    public class PiggyBankView : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private Slider fillProgressBar;
        [SerializeField] private TextMeshProUGUI fillStatusText;
        [SerializeField] private TextMeshProUGUI rewardsSummaryText;
        [SerializeField] private Button openButton;
        [SerializeField] private TextMeshProUGUI openButtonCostText;
        [SerializeField] private Transform pigIconTransform;

        public event Action OnOpenRequested;

        private void Awake()
        {
            if (openButton != null)
            {
                openButton.onClick.AddListener(() => OnOpenRequested?.Invoke());
            }
        }

        public void Bind(int currentFill, int maxFill, int gemsCost, int rewardGems, int rewardCoins, int rewardCards)
        {
            if (fillProgressBar != null)
            {
                fillProgressBar.maxValue = maxFill;
                fillProgressBar.value = currentFill;
            }

            bool isFull = currentFill >= maxFill;

            if (fillStatusText != null)
            {
                fillStatusText.text = isFull ? "PIGGY BANK FULL!" : $"Saving Coins... {currentFill}/{maxFill}";
            }

            if (rewardsSummaryText != null)
            {
                rewardsSummaryText.text = $"{rewardGems}💎  {rewardCoins:N0}🪙  {rewardCards} Cards";
            }

            if (openButtonCostText != null)
            {
                openButtonCostText.text = $"Open — {gemsCost}💎";
            }

            if (isFull && pigIconTransform != null)
            {
                StartCoroutine(JiggleRoutine());
            }
        }

        private IEnumerator JiggleRoutine()
        {
            while (true)
            {
                float elapsed = 0f;
                while (elapsed < 0.6f)
                {
                    elapsed += Time.deltaTime;
                    float angle = Mathf.Sin(elapsed * 25f) * 8f;
                    if (pigIconTransform != null)
                    {
                        pigIconTransform.localRotation = Quaternion.Euler(0, 0, angle);
                    }
                    yield return null;
                }
                if (pigIconTransform != null) pigIconTransform.localRotation = Quaternion.identity;
                yield return new WaitForSeconds(2.0f);
            }
        }
    }
}
