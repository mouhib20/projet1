import { IsNotEmpty, IsOptional, IsNumber, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReparationItemDto {
    @IsNotEmpty()
    @IsNumber()
    id_article: number;

    @IsNotEmpty()
    @IsNumber()
    qte: number;

    @IsOptional()
    @IsNumber()
    prix?: number;
}

export class CreateReparationDto {
    @IsNotEmpty()
    @IsNumber()
    id_client: number;

    @IsOptional()
    @IsString()
    appareil: string;

    @IsOptional()
    @IsString()
    description: string;

    @IsOptional()
    @IsNumber()
    cout_main_oeuvre: number;

    @IsOptional()
    @IsNumber()
    prix: number;

    @IsOptional()
    @IsString()
    statut: string;

    @IsOptional()
    date_reception: Date;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateReparationItemDto)
    items: CreateReparationItemDto[];
}
