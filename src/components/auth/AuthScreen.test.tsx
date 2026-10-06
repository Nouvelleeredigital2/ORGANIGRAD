import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * P1-9 / P1-10 — inscription et lien magique, moitié CLIENT.
 *
 * La réception d'un e-mail de confirmation ou d'un lien magique demande une
 * vraie boîte mail. Mais tout ce que l'écran fait AVANT et APRÈS l'appel réseau
 * est local : quelle méthode il appelle, ce qu'il affiche en cas d'erreur, ce
 * qu'il affiche en cas de succès, et l'état de chargement.
 *
 * Ces messages sont les tout premiers que voit un utilisateur — avant même
 * d'entrer dans l'application.
 */

const auth = vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOtp: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: { auth },
}));

const sante = vi.hoisted(() => ({ sonderServiceAuth: vi.fn() }));
vi.mock('./serviceSante', () => sante);

const { AuthScreen } = await import('./AuthScreen');

const champ = (nom: string) => screen.getByLabelText(nom) as HTMLInputElement;
const boutonEnvoi = () =>
    screen.getByRole('button', { name: /Se connecter|Créer le compte|Envoyer le lien|…/ });

/** Promesse résolue à la main, pour maîtriser l'instant où la sonde répond. */
function differee<T>() {
    let resoudre: (valeur: T) => void = () => {};
    const promesse = new Promise<T>((r) => {
        resoudre = r;
    });
    return { promesse, resoudre };
}

/** Remplit le formulaire puis soumet, dans le mode courant. */
function soumettre(email: string, motDePasse?: string) {
    fireEvent.change(champ('Email'), { target: { value: email } });
    if (motDePasse !== undefined) {
        fireEvent.change(champ('Mot de passe'), { target: { value: motDePasse } });
    }
    // `submit` sur le formulaire plutôt qu'un clic : jsdom ne déclenche pas
    // toujours la soumission implicite depuis un bouton.
    fireEvent.submit(boutonEnvoi().closest('form')!);
}

beforeEach(() => {
    auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
    auth.signUp.mockReset().mockResolvedValue({ error: null });
    auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    sante.sonderServiceAuth.mockReset().mockResolvedValue(true);
});

/**
 * ORGANIGRAD-1 (recette du 03/10/2026) — le projet Supabase ne résolvait plus,
 * et l'écran répondait « Vérifie ta connexion » : la panne était imputée au
 * réseau de l'utilisateur. Une indisponibilité doit se dire comme telle, et
 * rester distincte d'un refus d'identifiants.
 */
describe('AuthScreen — service d’authentification indisponible', () => {
    it('erreur renvoyée par supabase-js (AuthRetryableFetchError, status 0)', async () => {
        auth.signInWithPassword.mockResolvedValue({
            error: { name: 'AuthRetryableFetchError', status: 0, message: '{}' },
        });
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        expect(
            await screen.findByText(/service de connexion d'Organigrad est momentanément indisponible/i),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Vérifie ta connexion/i)).not.toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled(),
        );
    });

    it('exception réseau levée (TypeError: Failed to fetch)', async () => {
        auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        expect(await screen.findByText(/momentanément indisponible/i)).toBeInTheDocument();
    });

    it('sonde en échec au chargement : bandeau, formulaire laissé actif', async () => {
        sante.sonderServiceAuth.mockResolvedValue(false);
        render(<AuthScreen />);

        expect(await screen.findByText(/ne répond pas pour le moment/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    });

    it('« Réessayer » relance la sonde et retire le bandeau si le service revient', async () => {
        sante.sonderServiceAuth.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        render(<AuthScreen />);

        fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));

        await waitFor(() =>
            expect(screen.queryByText(/ne répond pas pour le moment/i)).not.toBeInTheDocument(),
        );
        expect(sante.sonderServiceAuth).toHaveBeenCalledTimes(2);
    });

    it('sonde au vert : aucun bandeau', async () => {
        // On attend la RÉSOLUTION de la sonde, pas seulement son appel : sans
        // cela, l'assertion passerait avant que le résultat ne soit appliqué.
        const sonde = differee<boolean>();
        sante.sonderServiceAuth.mockReturnValue(sonde.promesse);
        render(<AuthScreen />);
        expect(sante.sonderServiceAuth).toHaveBeenCalledTimes(1);

        await act(async () => {
            sonde.resoudre(true);
            await sonde.promesse;
        });
        expect(screen.queryByText(/ne répond pas pour le moment/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
    });

    it('sonde lente en échec après une connexion réussie : résultat ignoré', async () => {
        const sonde = differee<boolean>();
        sante.sonderServiceAuth.mockReturnValue(sonde.promesse);
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled(),
        );

        await act(async () => {
            sonde.resoudre(false);
            await sonde.promesse;
        });
        expect(screen.queryByText(/ne répond pas pour le moment/i)).not.toBeInTheDocument();
    });
});

describe('AuthScreen — messages d’erreur', () => {
    it('traduit « Invalid login credentials »', async () => {
        auth.signInWithPassword.mockResolvedValue({
            error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
        });
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        expect(await screen.findByText(/E-mail ou mot de passe incorrect/i)).toBeInTheDocument();
        // Le texte d'origine ne doit pas fuir jusqu'à l'écran.
        expect(screen.queryByText(/Invalid login credentials/i)).not.toBeInTheDocument();
    });

    it('signale un compte déjà existant à l’inscription', async () => {
        auth.signUp.mockResolvedValue({
            error: { code: 'user_already_exists', message: 'User already registered' },
        });
        render(<AuthScreen />);
        fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
        soumettre('camille@test.fr', 'motdepasse1');

        // Le message oriente vers l'action utile plutôt que de constater l'échec.
        expect(await screen.findByText(/compte existe déjà.*Connecte-toi plutôt/i)).toBeInTheDocument();
    });

    it('explique un mot de passe trop faible', async () => {
        auth.signUp.mockResolvedValue({
            error: { message: 'Password should be at least 6 characters' },
        });
        render(<AuthScreen />);
        fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
        soumettre('camille@test.fr', 'court');

        expect(await screen.findByText(/Mot de passe trop faible/i)).toBeInTheDocument();
    });

    it('explique une adresse invalide', async () => {
        auth.signInWithPassword.mockResolvedValue({
            error: { message: 'Unable to validate email address: invalid format' },
        });
        render(<AuthScreen />);
        soumettre('pas-un-email@x.fr', 'motdepasse1');

        expect(await screen.findByText(/Adresse e-mail invalide/i)).toBeInTheDocument();
    });

    it('laisse passer un message inconnu plutôt que de le masquer', async () => {
        // « Une erreur est survenue » n'aiderait personne et effacerait une
        // cause que le texte d'origine nomme peut-être correctement.
        auth.signInWithPassword.mockResolvedValue({
            error: { message: 'Database is starting up, retry shortly' },
        });
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        expect(await screen.findByText(/Database is starting up/i)).toBeInTheDocument();
    });
});

describe('AuthScreen — la bonne méthode selon le mode', () => {
    it('connexion : mot de passe', async () => {
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1));
        expect(auth.signInWithPassword).toHaveBeenCalledWith({
            email: 'camille@test.fr',
            password: 'motdepasse1',
        });
        expect(auth.signUp).not.toHaveBeenCalled();
        expect(auth.signInWithOtp).not.toHaveBeenCalled();
    });

    it('inscription : signUp, puis consigne de vérifier la boîte mail', async () => {
        render(<AuthScreen />);
        fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
        soumettre('camille@test.fr', 'motdepasse1');

        await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
        expect(await screen.findByText(/Compte créé/i)).toBeInTheDocument();
    });

    it('lien magique : aucun mot de passe transmis, et redirection sur l’origine', async () => {
        // Le champ mot de passe disparaît en mode magique : une valeur saisie
        // dans un mode précédent ne doit surtout pas partir avec la requête.
        render(<AuthScreen />);
        fireEvent.change(champ('Mot de passe'), { target: { value: 'saisie-precedente' } });
        fireEvent.click(screen.getByRole('button', { name: /Connexion par lien magique/i }));

        expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
        soumettre('camille@test.fr');

        await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledTimes(1));
        const args = auth.signInWithOtp.mock.calls[0]![0] as Record<string, unknown>;
        expect(args.email).toBe('camille@test.fr');
        expect(args).not.toHaveProperty('password');
        expect(args.options).toMatchObject({ emailRedirectTo: window.location.origin });
        expect(await screen.findByText(/Lien de connexion envoyé/i)).toBeInTheDocument();
    });
});

describe('AuthScreen — navigation entre les modes', () => {
    it('aller-retour connexion ↔ inscription ↔ lien magique', () => {
        render(<AuthScreen />);

        fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
        expect(screen.getByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /J'ai déjà un compte/i }));
        expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Connexion par lien magique/i }));
        expect(screen.getByRole('button', { name: /Envoyer le lien/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Revenir au mot de passe/i }));
        expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    });

    it('désactive le bouton pendant l’envoi', async () => {
        let debloquer: (v: { error: null }) => void = () => {};
        auth.signInWithPassword.mockReturnValue(
            new Promise((r) => {
                debloquer = r;
            }),
        );
        render(<AuthScreen />);
        soumettre('camille@test.fr', 'motdepasse1');

        await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeDisabled());

        debloquer({ error: null });
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled(),
        );
    });
});
