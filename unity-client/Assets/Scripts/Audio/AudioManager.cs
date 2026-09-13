using UnityEngine;

namespace CricketStrike.Audio
{
    public class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }

        [Header("Audio Sources")]
        [SerializeField] private AudioSource sfxSource;
        [SerializeField] private AudioSource crowdSource;
        [SerializeField] private AudioSource musicSource;

        [Header("SFX Clips")]
        [SerializeField] private AudioClip batHitSweetSpot;
        [SerializeField] private AudioClip batHitEdge;
        [SerializeField] private AudioClip wicketShatter;
        [SerializeField] private AudioClip crowdCheer;
        [SerializeField] private AudioClip crowdGasp;
        [SerializeField] private AudioClip coinEarn;
        [SerializeField] private AudioClip buttonClick;
        [SerializeField] private AudioClip perfectTimingFanfare;

        private void Awake()
        {
            if (Instance == null) Instance = this;
            else Destroy(gameObject);
        }

        public void PlayBatHit(bool isSixOrFour)
        {
            if (sfxSource == null) return;
            sfxSource.PlayOneShot(isSixOrFour ? batHitSweetSpot : batHitEdge);

            if (isSixOrFour && crowdSource != null)
            {
                crowdSource.PlayOneShot(crowdCheer);
            }
        }

        public void PlayWicket()
        {
            if (sfxSource != null && wicketShatter != null)
            {
                sfxSource.PlayOneShot(wicketShatter);
            }
            if (crowdSource != null && crowdGasp != null)
            {
                crowdSource.PlayOneShot(crowdGasp);
            }
        }

        public void PlayButtonClick()
        {
            if (sfxSource != null && buttonClick != null)
            {
                sfxSource.PlayOneShot(buttonClick);
            }
        }

        public void PlayCoinEarn()
        {
            if (sfxSource != null && coinEarn != null)
            {
                sfxSource.PlayOneShot(coinEarn);
            }
        }

        public void PlayPerfectTiming()
        {
            if (sfxSource != null && perfectTimingFanfare != null)
            {
                sfxSource.PlayOneShot(perfectTimingFanfare);
            }
        }
    }
}
