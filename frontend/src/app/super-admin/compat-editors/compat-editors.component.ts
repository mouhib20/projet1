import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CompatService } from '../../services/compat.service';
import { AuthService } from '../../services/auth.service';
import { CompatEditor } from '../../models/compat.model';

@Component({
    selector: 'app-compat-editors',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslatePipe],
    templateUrl: './compat-editors.component.html',
    styleUrls: ['./compat-editors.component.css']
})
export class CompatEditorsComponent implements OnInit {
    editors: CompatEditor[] = [];
    loading = false;
    errorMsg = '';
    successMsg = '';

    showForm = false;
    form: CompatEditor = this.emptyForm();
    saving = false;

    constructor(private compatService: CompatService, public auth: AuthService, private router: Router) { }

    ngOnInit(): void {
        this.loadEditors();
    }

    emptyForm(): CompatEditor {
        return { nom: '', username: '', password: '' };
    }

    loadEditors(): void {
        this.loading = true;
        this.compatService.getEditors().subscribe({
            next: (data) => { this.editors = data; this.loading = false; },
            error: () => { this.errorMsg = 'COMPAT_EDITORS.ERR_LOAD'; this.loading = false; }
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
        if (!this.form.nom?.trim()) { this.errorMsg = 'COMPAT_EDITORS.ERR_NAME_REQUIRED'; return; }
        if (!this.form.username?.trim()) { this.errorMsg = 'COMPAT_EDITORS.ERR_USERNAME_REQUIRED'; return; }
        if (!this.form.password || this.form.password.length < 6) { this.errorMsg = 'COMPAT_EDITORS.ERR_PASSWORD_LENGTH'; return; }

        this.clearMessages();
        this.saving = true;
        this.compatService.createEditor(this.form).subscribe({
            next: () => {
                this.saving = false;
                this.successMsg = 'COMPAT_EDITORS.SUCCESS_CREATE';
                this.showForm = false;
                this.loadEditors();
            },
            error: (err) => {
                this.saving = false;
                this.errorMsg = err.error?.message || 'COMPAT_EDITORS.ERR_CREATE';
            }
        });
    }

    toggleStatut(editor: CompatEditor): void {
        if (!editor.id) return;
        const next = !editor.actif;
        this.compatService.setEditorStatut(editor.id, next).subscribe({
            next: () => {
                this.successMsg = next ? 'COMPAT_EDITORS.SUCCESS_REACTIVATED' : 'COMPAT_EDITORS.SUCCESS_SUSPENDED';
                this.loadEditors();
            },
            error: (err) => { this.errorMsg = err.error?.message || 'COMPAT_EDITORS.ERR_STATUT'; }
        });
    }

    back(): void {
        this.router.navigate(['/super-admin/stores']);
    }
}
