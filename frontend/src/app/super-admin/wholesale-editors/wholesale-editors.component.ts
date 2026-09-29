import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WholesaleService } from '../../services/wholesale.service';
import { AuthService } from '../../services/auth.service';
import { WholesaleEditor } from '../../models/wholesale.model';

@Component({
    selector: 'app-wholesale-editors',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './wholesale-editors.component.html',
    styleUrls: ['./wholesale-editors.component.css']
})
export class WholesaleEditorsComponent implements OnInit {
    editors: WholesaleEditor[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    form: WholesaleEditor = this.emptyForm();
    saving = false;

    constructor(private wholesaleService: WholesaleService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.loadEditors();
    }

    emptyForm(): WholesaleEditor {
        return { nom: '', username: '', password: '' };
    }

    loadEditors(): void {
        this.loading = true;
        this.wholesaleService.getEditors().subscribe({
            next: (data) => { this.editors = data; this.loading = false; },
            error: () => { this.errorMsg = 'WHOLESALE_EDITORS.ERR_LOAD'; this.loading = false; }
        });
    }

    clearMessages(): void {
        this.errorMsg = '';
        this.successMsg = '';
    }

    openAddForm(): void {
        this.form = this.emptyForm();
        this.showForm = true;
        this.clearMessages();
    }

    cancelForm(): void {
        this.showForm = false;
    }

    save(): void {
        if (this.saving) return;
        if (!this.form.nom?.trim()) { this.errorMsg = 'WHOLESALE_EDITORS.ERR_NAME_REQUIRED'; return; }
        if (!this.form.username?.trim()) { this.errorMsg = 'WHOLESALE_EDITORS.ERR_USERNAME_REQUIRED'; return; }
        if (!this.form.password || this.form.password.length < 6) { this.errorMsg = 'WHOLESALE_EDITORS.ERR_PASSWORD_LENGTH'; return; }

        this.clearMessages();
        this.saving = true;
        this.wholesaleService.createEditor(this.form).subscribe({
            next: () => {
                this.saving = false;
                this.successMsg = 'WHOLESALE_EDITORS.SUCCESS_CREATE';
                this.showForm = false;
                this.loadEditors();
            },
            error: (err) => {
                this.saving = false;
                this.errorMsg = err.error?.message || 'WHOLESALE_EDITORS.ERR_CREATE';
            }
        });
    }

    toggleStatut(editor: WholesaleEditor): void {
        if (!editor.id) return;
        const next = !editor.actif;
        this.wholesaleService.setEditorStatut(editor.id, next).subscribe({
            next: () => {
                this.successMsg = next ? 'WHOLESALE_EDITORS.SUCCESS_REACTIVATED' : 'WHOLESALE_EDITORS.SUCCESS_SUSPENDED';
                this.loadEditors();
            },
            error: (err) => { this.errorMsg = err.error?.message || 'WHOLESALE_EDITORS.ERR_STATUT'; }
        });
    }

    back(): void {
        this.router.navigate(['/super-admin/stores']);
    }
}
